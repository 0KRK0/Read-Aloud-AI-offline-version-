# Lexora AI conversion server — Node + LibreOffice + Ghostscript + qpdf
FROM node:20-slim

# system converters (headless LibreOffice, Ghostscript, qpdf, Python+pdf2docx, fonts)
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-impress libreoffice-calc \
      ghostscript qpdf \
      python3 python3-pip \
      libgl1 libglib2.0-0 \
      fonts-dejavu fonts-liberation fonts-noto-core \
    && pip3 install --no-cache-dir --break-system-packages pdf2docx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
