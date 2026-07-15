# Lexora AI translation service — Meta NLLB-200 (MarianMT fallback), CPU-only.
#
# The NLLB model is PRE-BAKED into the image at build time (default), so there is
# no multi-minute download on first boot and redeploys reuse the cached layer.
#   - different model:  --build-arg NLLB_MODEL=facebook/nllb-200-distilled-1.3B
#   - skip baking (smaller image, use a /models volume instead): --build-arg PREBAKE=0
# NOTE: when the model is baked in, do NOT mount a volume at /models — a volume
# would shadow (hide) the baked files.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/models \
    OMP_NUM_THREADS=4 \
    PORT=5000

WORKDIR /app

# CPU-only torch first (much smaller than the default CUDA wheel)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ---- pre-bake the NLLB model into the image (build-time download) ----
ARG PREBAKE=1
ARG NLLB_MODEL=facebook/nllb-200-distilled-600M
ENV NLLB_MODEL=${NLLB_MODEL}
RUN if [ "$PREBAKE" = "1" ]; then \
      python -c "import os; from huggingface_hub import snapshot_download; \
snapshot_download(os.environ['NLLB_MODEL']); print('baked', os.environ['NLLB_MODEL'])"; \
    fi

COPY app.py ./

EXPOSE 5000
CMD ["python", "app.py"]
