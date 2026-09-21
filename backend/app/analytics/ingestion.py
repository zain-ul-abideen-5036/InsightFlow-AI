"""File ingestion: read an uploaded spreadsheet into a DataFrame safely.

Everything in this module assumes the input is hostile or malformed until proven
otherwise. Uploads arrive from the public internet, so we validate extension,
size, magic bytes, encoding, and structure before pandas ever sees the content —
and every rejection carries an explanation the uploader can act on.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd
from charset_normalizer import from_bytes

from app.core.config import settings
from app.core.errors import FileValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)

# File signatures. Extension alone is not evidence of anything.
XLSX_MAGIC = b"PK\x03\x04"          # zip container
XLS_MAGIC = b"\xd0\xcf\x11\xe0"     # OLE2 compound file

# Values that mean "missing" in real-world business exports.
NA_VALUES = [
    "", "na", "n/a", "N/A", "NA", "null", "NULL", "none", "None", "NONE",
    "-", "--", "nil", "NIL", "#N/A", "#NA", "#VALUE!", "#REF!", "#DIV/0!",
    "NaN", "nan", "<NA>", "?",
]

# A leading =, +, -, or @ in a CSV cell is executed as a formula when the file
# is reopened in Excel. We neutralise these so an exported report can never be
# used to attack the person who opens it.
_FORMULA_PREFIX = re.compile(r"^[=+\-@\t\r]")


@dataclass(slots=True)
class ReadResult:
    frame: pd.DataFrame
    encoding: str
    delimiter: str
    sheet_name: str | None = None
    total_rows: int = 0
    was_truncated: bool = False
    warnings: list[str] = field(default_factory=list)


def validate_upload(filename: str, size_bytes: int, head: bytes) -> str:
    """Validate an upload before it is written to disk. Returns the format key."""
    if not filename or not filename.strip():
        raise FileValidationError("The uploaded file has no name.")

    # Defeat path traversal in the client-supplied name.
    safe_name = Path(filename).name
    suffix = Path(safe_name).suffix.lower()

    if suffix not in settings.allowed_extensions:
        allowed = ", ".join(sorted(settings.allowed_extensions))
        raise FileValidationError(
            f"{suffix or 'This file type'} is not supported.",
            hint=f"Upload one of: {allowed}.",
        )

    if size_bytes <= 0:
        raise FileValidationError(
            "This file is empty.",
            hint="Export your data again and check the file contains rows.",
        )

    if size_bytes > settings.max_upload_bytes:
        raise FileValidationError(
            f"This file is {size_bytes / 1024 / 1024:.1f} MB, which is over the "
            f"{settings.max_upload_size_mb} MB limit.",
            hint="Split the export into smaller files, or filter to a shorter date range.",
        )

    if suffix in {".xlsx", ".xls"}:
        if head.startswith(XLSX_MAGIC):
            return "xlsx"
        if head.startswith(XLS_MAGIC):
            raise FileValidationError(
                "This is an old Excel (.xls) file, which we cannot read.",
                hint="Open it in Excel and choose Save As → .xlsx, or export as CSV.",
            )
        raise FileValidationError(
            "This file has an Excel extension but does not contain Excel data.",
            hint="Re-export the file from your spreadsheet application.",
        )

    # CSV/TSV: reject binary content masquerading as text.
    if head.startswith(XLSX_MAGIC) or head.startswith(XLS_MAGIC):
        raise FileValidationError(
            "This looks like a spreadsheet file saved with a .csv extension.",
            hint="Rename it to .xlsx, or export it as a real CSV.",
        )
    if b"\x00" in head:
        raise FileValidationError(
            "This file contains binary data and is not a readable CSV.",
            hint="Export the data again as CSV (UTF-8).",
        )
    return "csv"


def detect_encoding(raw: bytes) -> str:
    """Detect a text encoding, preferring UTF-8 when it is valid."""
    if raw.startswith(b"\xef\xbb\xbf"):
        return "utf-8-sig"
    sample = raw[:256_000]
    try:
        sample.decode("utf-8")
        return "utf-8"
    except UnicodeDecodeError:
        pass
    match = from_bytes(sample).best()
    if match and match.encoding:
        return match.encoding
    # cp1252 round-trips any byte sequence, so it is a safe last resort that
    # will not raise — mojibake is preferable to refusing the upload.
    return "cp1252"


def detect_delimiter(text_sample: str) -> str:
    """Sniff the field separator, falling back to frequency counting."""
    try:
        dialect = csv.Sniffer().sniff(text_sample, delimiters=",;\t|")
        return dialect.delimiter
    except csv.Error:
        pass
    first_lines = text_sample.splitlines()[:20]
    if not first_lines:
        return ","
    counts = {
        delimiter: sum(line.count(delimiter) for line in first_lines)
        for delimiter in [",", ";", "\t", "|"]
    }
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ","


def _dedupe_headers(columns: list[str]) -> tuple[list[str], list[str]]:
    """Make headers unique, non-empty, and safe to reference."""
    warnings: list[str] = []
    seen: dict[str, int] = {}
    result: list[str] = []
    for index, raw in enumerate(columns):
        name = str(raw).strip() if raw is not None else ""
        name = re.sub(r"\s+", " ", name)
        if not name or name.lower().startswith("unnamed:"):
            name = f"column_{index + 1}"
            warnings.append(f"Column {index + 1} had no header and was named '{name}'.")
        if name in seen:
            seen[name] += 1
            deduped = f"{name}_{seen[name]}"
            warnings.append(f"Duplicate column '{name}' was renamed to '{deduped}'.")
            name = deduped
        else:
            seen[name] = 0
        result.append(name)
    return result, warnings


def _duplicate_header_warnings(header: list[str]) -> list[str]:
    """Report repeated column names in the original file.

    pandas renames duplicates to ``name.1`` on its own, which is a reasonable
    recovery but a silent one. A user whose export produced two ``price``
    columns needs to know, because only one of them feeds the analysis.
    """
    seen: dict[str, int] = {}
    for name in header:
        seen[name] = seen.get(name, 0) + 1
    return [
        f"Column '{name}' appeared {count} times in the file; the copies were renamed."
        for name, count in seen.items()
        if count > 1
    ]


def _looks_like_header(values: list[Any]) -> bool:
    """Heuristic: is this row a header rather than data?"""
    strings = [str(v).strip() for v in values if v is not None and str(v).strip()]
    if len(strings) < max(2, len(values) * 0.6):
        return False
    numeric = sum(1 for s in strings if re.fullmatch(r"-?[\d.,]+", s))
    return numeric <= len(strings) * 0.3


def _find_header_row(df: pd.DataFrame, max_scan: int = 10) -> int:
    """Locate the header in exports that begin with title/blank rows."""
    for index in range(min(max_scan, len(df))):
        row = df.iloc[index].tolist()
        non_empty = [v for v in row if pd.notna(v) and str(v).strip()]
        if len(non_empty) >= max(2, len(row) * 0.5) and _looks_like_header(row):
            return index
    return 0


def sanitize_for_export(value: Any) -> Any:
    """Neutralise spreadsheet formula injection in a cell destined for export."""
    if isinstance(value, str) and _FORMULA_PREFIX.match(value):
        return "'" + value
    return value


def read_csv(raw: bytes, max_rows: int | None = None) -> ReadResult:
    encoding = detect_encoding(raw)
    try:
        text = raw.decode(encoding, errors="replace")
    except LookupError:
        encoding = "utf-8"
        text = raw.decode(encoding, errors="replace")

    if not text.strip():
        raise FileValidationError(
            "This file is empty.",
            hint="Check the export contains a header row and at least one row of data.",
        )

    delimiter = detect_delimiter(text[:64_000])
    warnings: list[str] = []

    read_kwargs: dict[str, Any] = {
        "sep": delimiter,
        "na_values": NA_VALUES,
        "keep_default_na": True,
        "skip_blank_lines": True,
        "on_bad_lines": "skip",
        "engine": "python",  # tolerant of ragged rows; speed is not critical here
        "dtype": object,
    }

    # Exports frequently begin with a narrow title row ("Quarterly Sales
    # Export") above the real header. Left to itself, pandas infers the column
    # count from that first row and discards every wider row as malformed — so
    # the probe is given explicit column names sized to the widest line.
    field_counts = [
        len(next(csv.reader([line], delimiter=delimiter)))
        for line in text.splitlines()[:80]
        if line.strip()
    ]
    max_fields = max(field_counts) if field_counts else 1

    try:
        probe = pd.read_csv(
            io.StringIO(text),
            nrows=40,
            header=None,
            names=list(range(max_fields)),
            **read_kwargs,
        )
    except pd.errors.EmptyDataError as exc:
        raise FileValidationError(
            "This file has no readable rows.",
            hint="Make sure the first row contains column names.",
        ) from exc
    except Exception as exc:  # noqa: BLE001 - surfaced as a user-facing message
        raise FileValidationError(
            "We could not read this file as a CSV.",
            hint="Open it in a spreadsheet application and re-export it as CSV (UTF-8).",
            details={"reason": str(exc)[:200]},
        ) from exc

    header_row = _find_header_row(probe)
    if header_row > 0:
        warnings.append(
            f"Skipped {header_row} row(s) above the header — they looked like title rows."
        )

    # Read the true header before pandas silently mangles duplicates into
    # "name.1", so the user is told their file had repeated column names.
    raw_header = [
        str(value).strip()
        for value in probe.iloc[header_row].tolist()
        if value is not None and str(value).strip() and str(value) != "nan"
    ]

    try:
        frame = pd.read_csv(
            io.StringIO(text),
            skiprows=header_row,
            header=0,
            nrows=max_rows,
            **read_kwargs,
        )
    except Exception as exc:  # noqa: BLE001
        raise FileValidationError(
            "We could not read this file as a CSV.",
            hint="Check for unclosed quotes or mismatched columns, then re-export.",
            details={"reason": str(exc)[:200]},
        ) from exc

    warnings.extend(_duplicate_header_warnings(raw_header))
    columns, header_warnings = _dedupe_headers(list(frame.columns))
    frame.columns = columns
    warnings.extend(header_warnings)

    frame = _drop_empty(frame, warnings)
    _assert_usable(frame)

    return ReadResult(
        frame=frame,
        encoding=encoding,
        delimiter=delimiter,
        total_rows=len(frame),
        warnings=warnings,
    )


def read_excel(raw: bytes, max_rows: int | None = None) -> ReadResult:
    warnings: list[str] = []
    try:
        workbook = pd.ExcelFile(io.BytesIO(raw), engine="openpyxl")
    except Exception as exc:  # noqa: BLE001
        raise FileValidationError(
            "We could not open this Excel file.",
            hint="Make sure it is a valid .xlsx file and is not password protected.",
            details={"reason": str(exc)[:200]},
        ) from exc

    if not workbook.sheet_names:
        raise FileValidationError("This workbook contains no sheets.")

    # Choose the sheet with the most usable data rather than always the first,
    # because real exports frequently lead with a cover or notes sheet.
    best_sheet, best_frame, best_score = None, None, -1.0
    for sheet in workbook.sheet_names[:10]:
        try:
            probe = workbook.parse(sheet, header=None, nrows=60, dtype=object)
        except Exception:  # noqa: BLE001
            continue
        if probe.empty:
            continue
        score = float(probe.notna().sum().sum())
        if score > best_score:
            best_sheet, best_frame, best_score = sheet, probe, score

    if best_sheet is None or best_frame is None:
        raise FileValidationError(
            "Every sheet in this workbook is empty.",
            hint="Add your data to a sheet and upload again.",
        )

    if len(workbook.sheet_names) > 1:
        warnings.append(
            f"This workbook has {len(workbook.sheet_names)} sheets. "
            f"We analysed '{best_sheet}', which contains the most data."
        )

    header_row = _find_header_row(best_frame)
    if header_row > 0:
        warnings.append(
            f"Skipped {header_row} row(s) above the header — they looked like title rows."
        )

    try:
        frame = workbook.parse(best_sheet, header=header_row, nrows=max_rows, dtype=object)
    except Exception as exc:  # noqa: BLE001
        raise FileValidationError(
            "We could not read the data in this workbook.",
            details={"reason": str(exc)[:200]},
        ) from exc

    columns, header_warnings = _dedupe_headers(list(frame.columns))
    frame.columns = columns
    warnings.extend(header_warnings)

    frame = _drop_empty(frame, warnings)
    _assert_usable(frame)

    return ReadResult(
        frame=frame,
        encoding="binary",
        delimiter="",
        sheet_name=best_sheet,
        total_rows=len(frame),
        warnings=warnings,
    )


def _drop_empty(frame: pd.DataFrame, warnings: list[str]) -> pd.DataFrame:
    """Remove all-empty rows and columns left behind by spreadsheet exports."""
    before_cols = len(frame.columns)
    frame = frame.dropna(axis=1, how="all")
    if (dropped := before_cols - len(frame.columns)) > 0:
        warnings.append(f"Removed {dropped} completely empty column(s).")

    before_rows = len(frame)
    frame = frame.dropna(axis=0, how="all").reset_index(drop=True)
    if (dropped := before_rows - len(frame)) > 0:
        warnings.append(f"Removed {dropped} completely empty row(s).")
    return frame


def _assert_usable(frame: pd.DataFrame) -> None:
    if frame.empty or len(frame.columns) == 0:
        raise FileValidationError(
            "This file contains column headers but no data rows.",
            hint="Export the data again and check that rows are included.",
        )
    if len(frame) < 2:
        raise FileValidationError(
            "This file contains only one row of data, which is not enough to analyse.",
            hint="Upload a file covering a longer period so trends can be calculated.",
        )


def read_upload(raw: bytes, filename: str, max_rows: int | None = None) -> ReadResult:
    """Validate and read an upload. The single entry point for ingestion."""
    file_format = validate_upload(filename, len(raw), raw[:8])
    limit = max_rows if max_rows is not None else settings.max_analysis_rows
    result = read_excel(raw, limit) if file_format == "xlsx" else read_csv(raw, limit)

    if limit and len(result.frame) >= limit:
        result.was_truncated = True
        result.warnings.append(
            f"This file is large, so the analysis uses the first {limit:,} rows."
        )
    return result


def checksum(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def load_frame(path: Path) -> pd.DataFrame:
    """Reload a previously normalised dataset from disk."""
    if path.suffix == ".parquet":
        return pd.read_parquet(path)
    return load_frame_bytes(path.read_bytes(), path.name)


def load_frame_bytes(raw: bytes, name: str) -> pd.DataFrame:
    """Reload a previously normalised dataset from its bytes.

    The same job as :func:`load_frame`, for storage backends that hand back
    content rather than a path. Keeping the format decision here — rather than
    at each call site — is what lets the storage backend change without any of
    the analysis code knowing.
    """
    suffix = Path(name).suffix.lower()
    if suffix == ".parquet":
        return pd.read_parquet(io.BytesIO(raw))
    if suffix in {".xlsx", ".xls"}:
        return read_excel(raw).frame
    return read_csv(raw).frame


class DatasetFileMissingError(FileNotFoundError):
    """The stored file behind a dataset is gone.

    Its own type because every caller has the same thing to say about it and
    none of them can do anything else: the analysis, `Ask` and `Investigate` all
    recompute from the file, so when it is missing the honest answer is to tell
    the user to upload it again — not to raise a generic error that reads as a
    fault on our side for a problem they can fix in ten seconds.
    """


def read_dataset_frame(
    storage_path: str, normalized_path: str | None = None, db: Any = None
) -> pd.DataFrame:
    """Load a stored dataset, preferring the normalised copy.

    The single place that turns "a dataset row" into "a DataFrame". Both keys
    are tried because the Parquet cache is written on a best-effort basis: an
    upload whose cache failed still has its original file, and falling back is
    the difference between a slower read and a dataset that cannot be analysed.

    Pass ``db`` from a request handler that already holds a session. Storing
    files in the database otherwise means this read opens a second connection
    while the first is still held, which on a small serverless pool halves the
    requests an instance can serve concurrently.
    """
    from app.core.storage import get_storage

    storage = get_storage()
    candidates = [key for key in (normalized_path, storage_path) if key]

    for key in candidates:
        try:
            raw = storage.read(key, db=db)
        except FileNotFoundError:
            continue
        return load_frame_bytes(raw, Path(key).name)

    raise DatasetFileMissingError(candidates[0] if candidates else "")


def frame_to_parquet_bytes(frame: pd.DataFrame) -> bytes:
    """Serialise a frame to Parquet in memory.

    The normalised copy is a cache: every later analysis reads columnar bytes
    instead of re-parsing a CSV and re-inferring its types. Callers treat a
    failure here as non-fatal, because the original file remains authoritative.
    """
    buffer = io.BytesIO()
    frame.to_parquet(buffer, index=False)
    return buffer.getvalue()
