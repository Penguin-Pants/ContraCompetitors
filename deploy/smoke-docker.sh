#!/bin/sh
# Builds the image and checks it the way production runs it:
# health, server UID not 0, Chromium sandbox on, and a restart that keeps scores but no faces.
set -eu
IMAGE=${IMAGE:-logistics-run:ci}
NAME=lr-smoke
PORT=${PORT:-3999}
VOLUME=lr-smoke-data
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; docker volume rm "$VOLUME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

[ "${SKIP_BUILD:-}" = "1" ] || docker build -t "$IMAGE" .
run() {
  docker run -d --name "$NAME" -p "$PORT:3000" -v "$VOLUME:/data" \
    --security-opt seccomp="$(pwd)/deploy/seccomp_profile.json" \
    -e CONTACT_EMAIL=takedown@example.com \
    -e SOURCE_URL=https://github.com/Penguin-Pants/ContraCompetitors \
    -e TRUST_PROXY_HOPS=0 "$IMAGE" >/dev/null
  for i in $(seq 1 60); do
    curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  docker logs "$NAME"
  echo "health check failed" >&2
  exit 1
}

run
echo "health: ok"
uid=$(docker exec "$NAME" sh -c 'ps -o uid= -p "$(pgrep -f "node server/src/index.ts" | head -1)"' | tr -d ' ')
[ "$uid" != "0" ] || { echo "server runs as root" >&2; exit 1; }
echo "server uid: $uid"
docker exec -u pwuser "$NAME" node server/src/cli/checkSandbox.ts

# Native stack in the image (sharp, onnxruntime, worker threads): a 2-face photo gives 2 crops.
faces=$(curl -fsS -F "faces=@server/test/fixtures/photos/gemini7-crew.jpg;type=image/jpeg" "http://127.0.0.1:$PORT/api/faces/upload" | grep -o '"id":' | wc -l | tr -d ' ')
[ "$faces" = "2" ] || { echo "upload gave $faces faces, expected 2" >&2; exit 1; }
echo "face detection: ok"

body='{"submissionId":"5f0c1c1e-8a3e-4f0e-9b56-1f2d3c4b5a69","initials":"CIX","timeMs":61234}'
curl -fsS -X POST -H 'content-type: application/json' -d "$body" "http://127.0.0.1:$PORT/api/leaderboard/medium" >/dev/null
docker restart "$NAME" >/dev/null
for i in $(seq 1 60); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:$PORT/api/leaderboard/medium" | grep -q '"initials":"CIX"' || { echo "score lost on restart" >&2; exit 1; }
echo "restart: scores kept"
files=$(docker exec "$NAME" sh -c 'find /data -type f ! -name "app.db*"')
[ -z "$files" ] || { echo "unexpected files in DATA_DIR: $files" >&2; exit 1; }
if docker exec "$NAME" sh -c 'grep -l -a -e "data:image/png" -e "IHDR" /data/app.db*'; then
  echo "face data in DATA_DIR" >&2
  exit 1
fi
echo "restart: DATA_DIR holds no face data"
curl -fsS "http://127.0.0.1:$PORT/" | grep -q 'name="contact-email" content="takedown@example.com"'
curl -fsS "http://127.0.0.1:$PORT/" | grep -q 'name="source-url" content="https://github.com/Penguin-Pants/ContraCompetitors"'
echo "meta tags: ok"
