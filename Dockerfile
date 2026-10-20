# Chromium for the headless retry ships in this image (pinned to the Playwright version in use).
FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=3000 \
    DATA_DIR=/data

COPY package.json package-lock.json .npmrc ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# Native deps (better-sqlite3, sharp, onnxruntime-node) ship prebuilt binaries; no install scripts,
# no compiler and no downloads outside npm.
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .
RUN npm run build \
    && npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
    && mkdir -p /data \
    && chown -R pwuser:pwuser /data

EXPOSE 3000
ENTRYPOINT ["/app/deploy/entrypoint.sh"]
CMD ["node", "server/src/index.ts"]
