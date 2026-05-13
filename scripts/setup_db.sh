#!/usr/bin/env bash

set -euo pipefail

PARADEDB_VERSION="${PARADEDB_VERSION:-0.23.4}"
PARADEDB_POSTGRES_VERSION="${PARADEDB_POSTGRES_VERSION:-18}"
IMAGE="${PARADEDB_IMAGE:-paradedb/paradedb:${PARADEDB_VERSION}-pg${PARADEDB_POSTGRES_VERSION}}"
CONTAINER_NAME="${PARADEDB_CONTAINER_NAME:-drizzle-paradedb}"

PORT="${PARADEDB_PORT:-5432}"
USER="${PARADEDB_USER:-postgres}"
PASSWORD="${PARADEDB_PASSWORD:-postgres}"
DB="${PARADEDB_DB:-postgres}"

export DATABASE_URL="${DATABASE_URL:-postgres://$USER:$PASSWORD@localhost:$PORT/$DB}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to set up the ParadeDB test database" >&2
  exit 1
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

echo "Waiting for ParadeDB to become ready..."
for _ in {1..30}; do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$USER" -d "$DB" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! docker exec "$CONTAINER_NAME" pg_isready -U "$USER" -d "$DB" >/dev/null 2>&1; then
  echo "ParadeDB did not become ready in time" >&2
  exit 1
fi
