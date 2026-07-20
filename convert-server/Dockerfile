# Lexora AI conversion server — Node + LibreOffice + Ghostscript + qpdf
FROM node:20-slim

# system converters (headless LibreOffice, Ghostscript, qpdf, Python+pdf2docx, fonts,
# Chromium for real HTML->PDF rendering, poppler for pdftotext + camelot's image backend)
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-impress libreoffice-calc \
      ghostscript qpdf \
      python3 python3-pip \
      tesseract-ocr \
      tesseract-ocr-hin tesseract-ocr-tam tesseract-ocr-tel tesseract-ocr-ben \
      tesseract-ocr-mar tesseract-ocr-guj tesseract-ocr-kan tesseract-ocr-mal \
      tesseract-ocr-pan tesseract-ocr-urd \
      chromium \
      poppler-utils \
      libgl1 libglib2.0-0 \
      fonts-dejavu fonts-liberation fonts-noto-core \
    && pip3 install --no-cache-dir --break-system-packages \
      pdf2docx ocrmypdf "camelot-py[cv]" openpyxl pandas \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js pdf2excel.py ./

# CHROME_BIN: the Debian package installs the binary as "chromium"
ENV PORT=8080 CHROME_BIN=chromium
# For Translate: point TRANSLATE_SERVER_URL at our own translation service
# (online/translate-server/ — Meta NLLB-200, MarianMT fallback; separate container,
# see its README for the Railway steps).
EXPOSE 8080
CMD ["node", "server.js"]
