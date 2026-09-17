#!/bin/sh
# Start the API in a deployment: bring the database schema up to date, then
# serve. Used by Dockerfile.deploy.
#
# Migrations run here rather than as a separate release step because the free
# hosting tier has no pre-deploy hook. Alembic takes a lock, and every
# migration is idempotent, so a restart re-running this is harmless.
set -eu

alembic upgrade head

# --proxy-headers: the host terminates HTTPS in front of us, so scheme and
# client address come from X-Forwarded-* headers.
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --proxy-headers \
    --forwarded-allow-ips "*"
