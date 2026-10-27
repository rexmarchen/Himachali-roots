#!/bin/sh
set -e

# When running in Railway or Docker with a persistent volume mounted at /data,
# the mounted volume directory may be owned by root on initial creation.
# Ensure required directories exist and fix ownership so 'pahadi' can write.
mkdir -p /data/uploads /data/private/seller-docs /data/backups /storage/uploads /storage/private/seller-docs /backups

if [ "$(id -u)" = '0' ]; then
  chown -R pahadi:pahadi /data /storage /backups /app 2>/dev/null || true
  exec gosu pahadi "$@"
fi

exec "$@"
