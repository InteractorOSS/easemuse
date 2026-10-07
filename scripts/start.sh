#!/usr/bin/env bash
# Copyright (c) 2026 Team of Wakers
# SPDX-License-Identifier: MIT
#
# ./scripts/start.sh - Development environment startup script
#
# Usage: ./scripts/start.sh [options]
# Options:
#   --check-only    Only check dependencies, don't start server
#   --setup         Run full setup (deps, prisma generate, migrations)
#   --skip-checks   Skip dependency checks and start immediately
#   -h, --help      Show this help
#
# Idempotent; works on macOS and Linux. Local values live in .env.local (git-ignored).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REQUIRED_NODE_MAJOR=24
ENV_FILE=".env.local"
PRISMA_SCHEMA="apps/web/prisma/schema.prisma"
REQUIRED_VARS=(DATABASE_URL REDIS_URL)

CHECK_ONLY=0
SETUP=0
SKIP_CHECKS=0

usage() { sed -n '4,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

for arg in "$@"; do
  case "$arg" in
    --check-only) CHECK_ONLY=1 ;;
    --setup) SETUP=1 ;;
    --skip-checks) SKIP_CHECKS=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -t 1 ]]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'; else G=""; Y=""; R=""; N=""; fi
ok()   { echo "${G}ok${N}    $*"; }
warn() { echo "${Y}warn${N}  $*"; }
fail() { echo "${R}fail${N}  $*" >&2; }
die()  { fail "$*"; exit 1; }

confirm() {
  # confirm "question" -> 0 if yes; non-interactive shells answer no
  [[ -t 0 ]] || return 1
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

url_host_port() {
  # url_host_port <url> <default-port> -> "host port"
  local rest="${1#*://}"; rest="${rest#*@}"; rest="${rest%%/*}"
  local host="${rest%%:*}" port="${rest##*:}"
  [[ "$rest" == *:* ]] || port="$2"
  echo "$host $port"
}

port_open() { (exec 3<>"/dev/tcp/$1/$2") 2>/dev/null; }

check_node() {
  command -v node >/dev/null || die "Node.js not found. Install Node ${REQUIRED_NODE_MAJOR} (nvm install ${REQUIRED_NODE_MAJOR})."
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  if (( major < REQUIRED_NODE_MAJOR )); then
    die "Node ${REQUIRED_NODE_MAJOR}+ required, found $(node -v). Run: nvm install ${REQUIRED_NODE_MAJOR}"
  fi
  ok "node $(node -v)"
}

check_pnpm() {
  if ! command -v pnpm >/dev/null; then
    if command -v corepack >/dev/null && confirm "pnpm not found. Enable via corepack?"; then
      corepack enable && corepack prepare pnpm@latest --activate
    else
      die "pnpm not found. Install with: corepack enable"
    fi
  fi
  ok "pnpm $(pnpm -v)"
}

check_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f .env.example ]] && confirm "$ENV_FILE missing. Create it from .env.example?"; then
      cp .env.example "$ENV_FILE"
      warn "Created $ENV_FILE. Fill in secrets (Interactor client id/secret, API keys), then re-run."
    else
      die "$ENV_FILE missing. Copy .env.example to $ENV_FILE and fill it in."
    fi
  fi
  load_env
  local missing=()
  for v in "${REQUIRED_VARS[@]}"; do [[ -n "${!v:-}" ]] || missing+=("$v"); done
  (( ${#missing[@]} == 0 )) || die "Missing in $ENV_FILE: ${missing[*]}"
  ok "$ENV_FILE has required variables"
}

check_postgres() {
  read -r host port < <(url_host_port "$DATABASE_URL" 5432)
  if port_open "$host" "$port"; then
    ok "PostgreSQL reachable at $host:$port"
  else
    die "PostgreSQL not reachable at $host:$port. Start it (macOS: brew services start postgresql@16)."
  fi
}

check_redis() {
  read -r host port < <(url_host_port "$REDIS_URL" 6379)
  if port_open "$host" "$port"; then
    ok "Redis reachable at $host:$port"
  else
    die "Redis not reachable at $host:$port. Start it (macOS: brew services start redis)."
  fi
}

install_deps() {
  if [[ ! -d node_modules ]] || (( SETUP )); then
    echo "Installing dependencies..."
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  fi
  ok "dependencies installed"
}

setup_prisma() {
  if [[ ! -f "$PRISMA_SCHEMA" ]]; then
    warn "$PRISMA_SCHEMA not found yet (created in T-F-06); skipping Prisma steps"
    return 0
  fi
  pnpm --filter ./apps/web exec prisma generate
  if [[ -z "${DATABASE_ADMIN_URL:-}" ]]; then
    warn "DATABASE_ADMIN_URL not set: migrations will run as DATABASE_URL, which must then be the table owner"
  fi
  ok "prisma client generated"
  if (( SETUP )) || confirm "Apply pending migrations (prisma migrate dev)?"; then
    pnpm --filter ./apps/web exec prisma migrate dev
  else
    pnpm --filter ./apps/web exec prisma migrate deploy
  fi
  ok "database migrated"
}

if [[ ! -f package.json ]]; then
  warn "No package.json yet: the workspace is scaffolded in T-F-01 (docs/planning/tasks.md)."
  warn "Checking the environment only."
  CHECK_ONLY=1
fi

if (( ! SKIP_CHECKS )); then
  echo "== Checking environment =="
  check_node
  check_pnpm
  check_env_file
  check_postgres
  check_redis
fi

(( CHECK_ONLY )) && { ok "checks complete"; exit 0; }

load_env
if (( ! SKIP_CHECKS )); then
  install_deps
  setup_prisma
fi

PORT="${PORT:-3000}"
echo
echo "== Starting EaseMuse =="
echo "  web:     http://localhost:${PORT}"
echo "  tests:   pnpm test    lint: pnpm lint    studio: pnpm --filter ./apps/web exec prisma studio"
echo
exec pnpm dev
