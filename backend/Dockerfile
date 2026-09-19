# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- builder ---
# Dependencies are installed in a separate stage so the final image carries no
# build toolchain. pandas/numpy/scipy wheels are large; keeping gcc out of the
# runtime layer saves several hundred megabytes.
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1     PIP_NO_CACHE_DIR=1     PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN apt-get update  && apt-get install -y --no-install-recommends build-essential  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m venv /opt/venv  && /opt/venv/bin/pip install --upgrade pip  && /opt/venv/bin/pip install -r requirements.txt

# ---------------------------------------------------------------- runtime ---
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1     PYTHONUNBUFFERED=1     PATH="/opt/venv/bin:$PATH"

# Never run as root: a file-upload service is exactly the kind of thing where
# that matters.
RUN useradd --create-home --uid 1001 insightflow

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=insightflow:insightflow . .

RUN mkdir -p /app/storage && chown -R insightflow:insightflow /app/storage
USER insightflow

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4).status == 200 else 1)"

# Migrations run at start-up so a deploy never serves against an out-of-date
# schema. `--workers 1` is deliberate: the in-process job runner keeps analysis
# state in one process, so scaling is by replica, not by worker.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
