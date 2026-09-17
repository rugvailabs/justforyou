FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models

WORKDIR /app

# ffmpeg is a real binary dependency, not a Python one: the ffmpeg-python
# package only builds command lines for the CLI and bundles nothing. Whisper
# needs it to demux audio out of uploaded video containers, and ffprobe to
# detect whether a container has an audio track at all.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential libpq-dev curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-deploy.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
