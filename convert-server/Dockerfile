# Lexora AI conversion server — Node + LibreOffice + Ghostscript + qpdf
FROM node:20-slim

# system converters (headless LibreOffice, Ghostscript, qpdf, fonts)
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-impress libreoffice-calc \
      ghostscript qpdf \
      fonts-dejavu fonts-liberation fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
