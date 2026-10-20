#!/bin/sh
# The server never runs as root. When the container starts as root (for example because the
# platform mounts the DATA_DIR volume owned by root), fix the volume owner, then drop to pwuser.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R pwuser:pwuser "$DATA_DIR"
  exec setpriv --reuid=pwuser --regid=pwuser --init-groups "$@"
fi
exec "$@"
