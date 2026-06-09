# Универсальный Dockerfile: работает на HuggingFace Spaces, Railway, Coolify, локально.

FROM python:3.11-slim

# HuggingFace Spaces требует non-root пользователя с uid 1000.
RUN useradd -m -u 1000 user

# System dependencies — ffmpeg required to convert webm/Opus → wav for Whisper.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache marker (bump to invalidate Docker cache when deps change): v3
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Pre-download Whisper model во время build для быстрого cold-start.
# Override at build time: --build-arg WHISPER_MODEL=openai/whisper-medium
ARG WHISPER_MODEL=openai/whisper-small
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python -c "from transformers import pipeline; pipeline('automatic-speech-recognition', model='${WHISPER_MODEL}')" \
    && chown -R user:user /root/.cache 2>/dev/null || true

# Кешируем HF модели в /home/user/.cache (доступно non-root)
ENV HF_HOME=/home/user/.cache/huggingface
ENV TRANSFORMERS_CACHE=/home/user/.cache/huggingface
RUN mkdir -p /home/user/.cache && chown -R user:user /home/user/.cache

COPY --chown=user:user ./app /app/app

USER user

ENV PORT=7860
ENV PYTHONUNBUFFERED=1

EXPOSE 7860

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
