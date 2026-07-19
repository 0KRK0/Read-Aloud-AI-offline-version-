# Lexora AI translation service v2 — NLLB-200 on CTranslate2 int8, CPU-only.
#
# TWO-STAGE build:
#   Stage 1 (convert): torch + transformers ONLY here — downloads the HF model
#     and converts it to a quantized CTranslate2 model (~650 MB) + tokenizer.
#   Stage 2 (runtime): tiny image, NO torch. Model baked in — instant boots,
#     no cold-start download, and the whole process fits in <1 GB RAM
#     (the fp32-torch version needed ~3.5 GB and OOM-looped on 2 GB hosts).
#
#   Different model:  --build-arg NLLB_MODEL=facebook/nllb-200-distilled-1.3B
FROM python:3.11-slim AS convert
ARG NLLB_MODEL=facebook/nllb-200-distilled-600M
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir "transformers>=4.40" sentencepiece "ctranslate2>=4.0"
RUN ct2-transformers-converter --model ${NLLB_MODEL} \
      --output_dir /model/ct2 --quantization int8 \
 && python -c "from transformers import AutoTokenizer; \
AutoTokenizer.from_pretrained('${NLLB_MODEL}').save_pretrained('/model/tok')"

FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PORT=5000 MODEL_DIR=/model
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=convert /model /model
COPY app.py ./
EXPOSE 5000
# Railway: set the service healthcheck path to /healthz (readiness-gated).
CMD ["python", "app.py"]
