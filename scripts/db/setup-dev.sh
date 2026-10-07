#!/usr/bin/env bash
# Copyright (c) 2026 Team of Wakers
# SPDX-License-Identifier: MIT
#
# Creates the local development and test databases, the pgvector extension and the
# runtime role `easemuse_app` (LOGIN, not superuser, no BYPASSRLS; dev-only password).
# Idempotent. Needs a superuser connection (PG_ADMIN_URL, default: local socket as your OS user).
#
# Usage: scripts/db/setup-dev.sh [--test-only]

set -euo pipefail

PG_ADMIN_URL="${PG_ADMIN_URL:-postgresql://localhost:5432/postgres}"
APP_ROLE="easemuse_app"
APP_PASSWORD="easemuse_app"
DATABASES=(easemuse_dev easemuse_test)
[[ "${1:-}" == "--test-only" ]] && DATABASES=(easemuse_test)

psql_admin() { psql "$PG_ADMIN_URL" -v ON_ERROR_STOP=1 -qAt "$@"; }
db_url() { echo "${PG_ADMIN_URL%/*}/$1"; }

psql_admin <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$APP_ROLE') THEN
    CREATE ROLE $APP_ROLE LOGIN PASSWORD '$APP_PASSWORD' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  ELSE
    ALTER ROLE $APP_ROLE LOGIN PASSWORD '$APP_PASSWORD' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
\$\$;
SQL

for db in "${DATABASES[@]}"; do
  if [[ -z "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname = '$db'")" ]]; then
    psql_admin -c "CREATE DATABASE $db"
    echo "created database $db"
  fi
  psql "$(db_url "$db")" -v ON_ERROR_STOP=1 -qAt -c "CREATE EXTENSION IF NOT EXISTS vector"
  echo "ok: $db (vector extension, role $APP_ROLE)"
done
