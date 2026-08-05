#!/usr/bin/env bash

set -euo pipefail

PARADEDB_VERSION="${PARADEDB_VERSION:-0.25.0}"
PARADEDB_POSTGRES_VERSION="${PARADEDB_POSTGRES_VERSION:-18}"
IMAGE="${PARADEDB_IMAGE:-paradedb/paradedb:${PARADEDB_VERSION}-pg${PARADEDB_POSTGRES_VERSION}}"
CONTAINER_NAME="${PARADEDB_CONTAINER_NAME:-drizzle-paradedb}"

PORT="${PARADEDB_PORT:-5432}"
USER="${PARADEDB_USER:-postgres}"
PASSWORD="${PARADEDB_PASSWORD:-postgres}"
DB="${PARADEDB_DB:-postgres}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to set up the ParadeDB test database" >&2
  exit 1
fi

# A container left over from a failed run can exist without publishing the
# port, in which case reusing it yields confusing connection errors. Drop it
# so the normal creation path below builds a working one.
if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME" &&
! docker port "$CONTAINER_NAME" 5432 2>/dev/null | grep -q ":${PORT}$"; then
  echo "Container $CONTAINER_NAME exists but does not publish port ${PORT}; recreating it..."
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

if ! docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
  echo "Starting ParadeDB container $CONTAINER_NAME from $IMAGE..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    -e "POSTGRES_USER=$USER" \
    -e "POSTGRES_PASSWORD=$PASSWORD" \
    -e "POSTGRES_DB=$DB" \
    -p "$PORT:5432" \
    "$IMAGE" >/dev/null
else
  echo "Container $CONTAINER_NAME already exists; starting it..."
  docker start "$CONTAINER_NAME" >/dev/null
fi

# Check readiness over TCP: during first-time initialization the image runs a
# temporary socket-only server that seeds extensions and sample data, and it
# must not be mistaken for the real one.
echo "Waiting for ParadeDB to become ready..."
for _ in {1..30}; do
  if docker exec "$CONTAINER_NAME" pg_isready -h 127.0.0.1 -U "$USER" -d "$DB" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

if ! docker exec "$CONTAINER_NAME" pg_isready -h 127.0.0.1 -U "$USER" -d "$DB" >/dev/null 2>&1; then
  echo "ParadeDB did not become ready in time" >&2
  exit 1
fi
