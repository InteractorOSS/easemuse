#!/usr/bin/env bash
# Copyright (c) 2026 Team of Wakers
# SPDX-License-Identifier: MIT
# EaseMuse demo host bootstrap (Ubuntu 24.04, VM.Standard.E2.1.Micro). Idempotent; run as root.
# Generates secrets ON the host only; never overwrites existing /opt/easemuse/.env or app.env.
set -euo pipefail
DOMAIN=easemuse.demo.interactor.com; D=/opt/easemuse
export DEBIAN_FRONTEND=noninteractive
# --- swap: 4G so 1G RAM survives node + postgres + chromium peaks
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  fallocate -l 4G /swapfile; chmod 600 /swapfile; mkswap -q /swapfile; swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
printf 'vm.swappiness=10\nvm.vfs_cache_pressure=50\n' > /etc/sysctl.d/99-easemuse.conf; sysctl -q --system
# --- packages
echo 'iptables-persistent iptables-persistent/autosave_v4 boolean false' | debconf-set-selections
echo 'iptables-persistent iptables-persistent/autosave_v6 boolean false' | debconf-set-selections
apt-get update -q
apt-get install -yq ca-certificates curl gnupg jq cron nano openssl iptables-persistent unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https >/dev/null
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
# --- host firewall: OCI images REJECT everything but 22; open 80/tcp 443/tcp 443/udp (live + persisted)
for spec in "tcp 80" "tcp 443" "udp 443"; do set -- $spec
  if ! iptables -C INPUT -p $1 -m state --state NEW -m $1 --dport $2 -j ACCEPT 2>/dev/null; then
    n=$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')
    iptables -I INPUT ${n:-1} -p $1 -m state --state NEW -m $1 --dport $2 -j ACCEPT
  fi
done
R=/etc/iptables/rules.v4
if [ -f $R ] && ! grep -q -- '--dport 443' $R; then
  sed -i '0,/^-A INPUT -j REJECT/s//-A INPUT -p tcp -m state --state NEW -m tcp --dport 80 -j ACCEPT\n-A INPUT -p tcp -m state --state NEW -m tcp --dport 443 -j ACCEPT\n-A INPUT -p udp -m state --state NEW -m udp --dport 443 -j ACCEPT\n&/' $R
fi
# --- ssh: keys only
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' > /etc/ssh/sshd_config.d/99-easemuse.conf
systemctl reload ssh || systemctl reload sshd || true
# --- docker
if ! command -v docker >/dev/null; then
  install -m0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release; echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -q; apt-get install -yq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
fi
mkdir -p /etc/docker
echo '{"log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"},"live-restore":true}' > /etc/docker/daemon.json
systemctl enable -q docker; systemctl restart docker; usermod -aG docker ubuntu
# --- caddy
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q; apt-get install -yq caddy >/dev/null
fi
# --- app dir + generated secrets (never leave this host)
mkdir -p $D/initdb $D/backups; chmod 700 $D
gen(){ openssl rand -hex 24; }
if [ ! -f $D/.env ]; then ( umask 077; cat > $D/.env <<E
COMPOSE_PROJECT_NAME=easemuse
POSTGRES_PASSWORD=$(gen)
EASEMUSE_OWNER_PASSWORD=$(gen)
EASEMUSE_APP_PASSWORD=$(gen)
EASEMUSE_DATARIGHTS_PASSWORD=$(gen)
REDIS_PASSWORD=$(gen)
# Image tags for the app (set when the Docker images exist)
EASEMUSE_WEB_IMAGE=easemuse-web:local
EASEMUSE_WORKER_IMAGE=easemuse-worker:local
EASEMUSE_MIGRATE_IMAGE=easemuse-migrate:local
E
); fi
set -a; . $D/.env; set +a
if [ ! -f $D/app.env ]; then ( umask 077; cat > $D/app.env <<E
# EaseMuse production runtime env. Generated $(date -u +%F). Mode 600: never commit, never paste into chat.
APP_URL=https://$DOMAIN
# Auth.js callback origin: the standalone server otherwise sees its bind address (0.0.0.0:3000)
AUTH_URL=https://$DOMAIN
PORT=3000
HOSTNAME=0.0.0.0
DATABASE_URL=postgresql://easemuse_app:${EASEMUSE_APP_PASSWORD}@postgres:5432/easemuse
DATABASE_ADMIN_URL=postgresql://easemuse_owner:${EASEMUSE_OWNER_PASSWORD}@postgres:5432/easemuse
DATABASE_SSL=false
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
AUTH_SECRET=$(openssl rand -base64 32)
MFA_ENFORCEMENT=log
WEB_SEARCH=off
AI_FAKE=off
RENDER_BASE_URL=http://web:3000
CHROMIUM_PATH=/usr/bin/chromium
MAIL_FROM=noreply@interactor.com
S3_ENDPOINT=https://axdlmmrmhtza.compat.objectstorage.us-phoenix-1.oraclecloud.com
S3_REGION=us-phoenix-1
S3_BUCKET=easemuse-files
# ---- Fill in on this host: sudo nano /opt/easemuse/app.env (uncomment each line) ----
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=
# INTERACTOR_AUTH_CLIENT_ID=
# INTERACTOR_AUTH_CLIENT_SECRET=
# ANTHROPIC_API_KEY=
# VOYAGE_API_KEY=
# Optional, without SMTP mail is captured not sent:
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASSWORD=
E
); fi
# --- postgres init: owner (migrations) / app (runtime, RLS-bound) / datarights roles, pgvector
cat > $D/initdb/10-easemuse.sh <<'SH'
#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
CREATE ROLE easemuse_owner LOGIN PASSWORD '${EASEMUSE_OWNER_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE easemuse_app LOGIN PASSWORD '${EASEMUSE_APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE easemuse_datarights LOGIN PASSWORD '${EASEMUSE_DATARIGHTS_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE DATABASE easemuse OWNER easemuse_owner;
SQL
psql -v ON_ERROR_STOP=1 -U postgres -d easemuse <<SQL
CREATE EXTENSION IF NOT EXISTS vector;
ALTER SCHEMA public OWNER TO easemuse_owner;
REVOKE ALL ON DATABASE easemuse FROM PUBLIC;
GRANT CONNECT ON DATABASE easemuse TO easemuse_owner, easemuse_app, easemuse_datarights;
SQL
SH
chmod 755 $D/initdb/10-easemuse.sh
cat > $D/compose.yml <<'Y'
name: easemuse
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: easemuse-postgres
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      EASEMUSE_OWNER_PASSWORD: ${EASEMUSE_OWNER_PASSWORD}
      EASEMUSE_APP_PASSWORD: ${EASEMUSE_APP_PASSWORD}
      EASEMUSE_DATARIGHTS_PASSWORD: ${EASEMUSE_DATARIGHTS_PASSWORD}
    command: ["postgres","-c","shared_buffers=64MB","-c","effective_cache_size=256MB","-c","work_mem=2MB","-c","maintenance_work_mem=32MB","-c","max_connections=40","-c","max_wal_size=512MB"]
    volumes: ["pgdata:/var/lib/postgresql/data","./initdb:/docker-entrypoint-initdb.d:ro"]
    ports: ["127.0.0.1:5432:5432"]
    shm_size: 128mb
    mem_limit: 320m
    healthcheck: {test: ["CMD-SHELL","pg_isready -U postgres -d easemuse"], interval: 10s, timeout: 5s, retries: 12}
  redis:
    image: redis:7-alpine
    container_name: easemuse-redis
    restart: unless-stopped
    environment: {REDIS_PASSWORD: "${REDIS_PASSWORD}"}
    command: ["redis-server","--requirepass","${REDIS_PASSWORD}","--maxmemory","64mb","--maxmemory-policy","noeviction","--appendonly","yes","--save",""]
    volumes: ["redisdata:/data"]
    ports: ["127.0.0.1:6379:6379"]
    mem_limit: 96m
    healthcheck: {test: ["CMD-SHELL","redis-cli -a \"$$REDIS_PASSWORD\" --no-auth-warning ping | grep -q PONG"], interval: 10s, timeout: 5s, retries: 12}
  # ---- app: docker compose --profile app up -d   (migrations: docker compose --profile migrate run --rm migrate)
  migrate:
    image: ${EASEMUSE_MIGRATE_IMAGE}
    profiles: ["migrate"]
    env_file: app.env
    depends_on: {postgres: {condition: service_healthy}}
  web:
    image: ${EASEMUSE_WEB_IMAGE}
    profiles: ["app"]
    restart: unless-stopped
    env_file: app.env
    environment: {PROCESS_ROLE: web, DATABASE_POOL_SIZE: "5"}
    ports: ["127.0.0.1:3000:3000"]
    mem_limit: 600m
    depends_on: {postgres: {condition: service_healthy}, redis: {condition: service_healthy}}
  worker:
    image: ${EASEMUSE_WORKER_IMAGE}
    profiles: ["app"]
    restart: unless-stopped
    env_file: app.env
    environment:
      PROCESS_ROLE: worker
      DATABASE_POOL_SIZE: "4"
      DATABASE_URL_DATARIGHTS: postgresql://easemuse_datarights:${EASEMUSE_DATARIGHTS_PASSWORD}@postgres:5432/easemuse
    shm_size: 256mb
    mem_limit: 600m
    depends_on: {postgres: {condition: service_healthy}, redis: {condition: service_healthy}}
volumes: {pgdata: {}, redisdata: {}}
Y
# --- caddy: auto TLS (Let's Encrypt), HTTP->HTTPS, SSE-safe proxy, maintenance page while app is down
mkdir -p /var/www/easemuse-maintenance /var/log/caddy
cat > /var/www/easemuse-maintenance/index.html <<'H'
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EaseMuse</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f5f2;color:#222}main{text-align:center;padding:2rem}h1{font-weight:600}</style></head><body><main><h1>EaseMuse</h1><p>We're getting things ready. Please check back shortly.</p></main></body></html>
H
cat > /etc/caddy/Caddyfile <<C
$DOMAIN {
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
    reverse_proxy 127.0.0.1:3000 {
        flush_interval -1
    }
    handle_errors 502 503 504 {
        root * /var/www/easemuse-maintenance
        rewrite * /index.html
        file_server
    }
    log {
        output file /var/log/caddy/easemuse.log {
            roll_size 10MiB
            roll_keep 5
        }
    }
}
C
# validate as the caddy user: validating as root creates a root-owned log file that the service can't open
sudo -u caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; chown -R caddy:caddy /var/log/caddy
systemctl enable -q caddy; systemctl reload caddy || systemctl restart caddy
# --- nightly logical backup, 7 days local retention
cat > $D/backup.sh <<'B'
#!/bin/bash
set -euo pipefail
f=/opt/easemuse/backups/easemuse-$(date -u +%Y%m%dT%H%MZ).dump
docker exec easemuse-postgres pg_dump -U postgres -Fc easemuse > "$f"
find /opt/easemuse/backups -name '*.dump' -mtime +7 -delete
B
chmod 700 $D/backup.sh
echo '17 10 * * * root /opt/easemuse/backup.sh' > /etc/cron.d/easemuse-backup
# --- bring up data services
cd $D && docker compose up -d postgres redis
for i in $(seq 1 30); do [ "$(docker inspect -f '{{.State.Health.Status}}' easemuse-postgres)" = healthy ] && [ "$(docker inspect -f '{{.State.Health.Status}}' easemuse-redis)" = healthy ] && break; sleep 4; done
chmod 600 $D/.env $D/app.env
echo "== VERIFY"
docker compose ps --format '{{.Name}} {{.Status}}'
docker exec easemuse-postgres psql -U postgres -d easemuse -Atc "select rolname, rolsuper, rolbypassrls from pg_roles where rolname like 'easemuse%' order by 1; select 'vector '||extversion from pg_extension where extname='vector';"
docker exec -e PGPASSWORD="$EASEMUSE_APP_PASSWORD" easemuse-postgres psql -h 127.0.0.1 -U easemuse_app -d easemuse -Atc "select 'app login ok'"
docker exec easemuse-redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping'
free -m | sed -n 1,3p
echo HOST_DONE
