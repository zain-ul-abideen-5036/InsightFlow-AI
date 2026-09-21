"use client";

import * as React from "react";
import { AlertCircle, FileSpreadsheet, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ClientApiError } from "@/lib/api-client";
import { MAX_UPLOAD_MB } from "@/lib/site";
import { cn, formatBytes } from "@/lib/utils";

const ACCEPTED = [".csv", ".xlsx", ".xls", ".tsv"];

/**
 * File picker with drag-and-drop.
 *
 * Validates extension and size in the browser so the user hears about an
 * obvious problem immediately rather than after a long upload. The backend
 * re-validates everything, including magic bytes, because a browser check is
 * advice, not a control.
 *
 * The size check has a second job on a serverless host, where the platform
 * rejects an oversized body itself, before any of this application's code
 * runs — with a generic error naming a function rather than a file. Catching
 * it here is what keeps the explanation in the product's own words. See
 * MAX_UPLOAD_MB.
 */
export function UploadDropzone({
  onUpload,
  uploading,
  error,
}: {
  onUpload: (file: File) => void;
  uploading: boolean;
  error?: ClientApiError | Error | null;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [selected, setSelected] = React.useState<File | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const validate = React.useCallback((file: File): string | null => {
    const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (!ACCEPTED.includes(extension)) {
      return `${extension || "That file type"} is not supported. Upload a CSV or Excel file.`;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      return `That file is ${formatBytes(file.size)}, which is over the ${MAX_UPLOAD_MB} MB limit.`;
    }
    if (file.size === 0) {
      return "That file is empty.";
    }
    return null;
  }, []);

  const accept = React.useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const problem = validate(file);
      setLocalError(problem);
      setSelected(problem ? null : file);
      if (!problem) onUpload(file);
    },
    [onUpload, validate],
  );

  const message =
    localError ??
    (error instanceof ClientApiError ? error.payload.message : error?.message) ??
    null;
  const hint = error instanceof ClientApiError ? error.payload.hint : undefined;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3.5 rounded-2xl border",
          "px-6 py-11 text-center transition-[background-color,border-color] duration-base",
          // A dashed outline reads as an unimplemented placeholder. The drop
          // target is communicated by the surface and the icon instead, and
          // the border only becomes dashed while a file is actually over it.
          dragging
            ? "border-2 border-dashed border-primary bg-primary-subtle"
            : "border-border bg-card shadow-e1 hover:border-border-strong",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-surface-sunken text-muted-foreground shadow-e0">
          {selected ? (
            <FileSpreadsheet className="size-5" aria-hidden="true" />
          ) : (
            <Upload className="size-5" aria-hidden="true" />
          )}
        </div>

        {selected ? (
          <div className="space-y-1">
            <p className="text-base font-semibold">{selected.name}</p>
            <p className="text-sm text-muted-foreground">{formatBytes(selected.size)}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-base font-semibold">
              Drag your export here, or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                browse
              </button>
            </p>
            <p className="text-sm text-muted-foreground">
              CSV, TSV, or Excel (.xlsx) — up to {MAX_UPLOAD_MB} MB
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="sr-only"
          onChange={(event) => accept(event.target.files?.[0])}
          aria-label="Choose a data file to upload"
        />

        {uploading ? (
          <p className="text-sm text-muted-foreground" role="status">
            Uploading and reading your file…
          </p>
        ) : null}
      </div>

      {message ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-danger-border bg-danger-subtle px-4 py-3.5"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-semibold">{message}</p>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setLocalError(null);
              setSelected(null);
            }}
            aria-label="Dismiss error"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
