#!/usr/bin/env bash
# Copyright (c) 2026 Team of Wakers
# SPDX-License-Identifier: MIT
#
# Installed as /opt/easemuse/bin/deploy (root:root 0755). The CI deploy key can run only this:
#   authorized_keys of easemuse-deploy: restrict,command="sudo -n /opt/easemuse/bin/deploy \"$SSH_ORIGINAL_COMMAND\"" <key>
#   sudoers: easemuse-deploy ALL=(root) NOPASSWD: /opt/easemuse/bin/deploy
# Usage over that key:  docker save easemuse-{web,worker,migrate}:<sha> | gzip | ssh easemuse-deploy@host "deploy <sha>"
# Loads the images from stdin, migrates, switches web+worker, health-checks, and rolls back the
# image tags if the new release does not come up. Migrations are forward-only and not rolled back.
set -euo pipefail
D=/opt/easemuse
KEEP=3

request=${1:-}
[[ $request =~ ^deploy\ ([0-9a-f]{7,40})$ ]] || { echo "usage: deploy <git-sha>" >&2; exit 2; }
tag=${BASH_REMATCH[1]}

exec 9>/run/easemuse-deploy.lock
flock -n 9 || { echo "another deploy is running" >&2; exit 75; }
cd "$D"
log() { echo "[deploy $tag] $*"; }

log "loading images"
gunzip | docker load | sed 's/^/  /'
for image in web worker migrate; do
  docker image inspect "easemuse-$image:$tag" >/dev/null || { log "missing easemuse-$image:$tag"; exit 1; }
done

cp -p .env .env.prev
set_tags() {
  sed -i -E "s/^(EASEMUSE_(WEB|WORKER|MIGRATE)_IMAGE=easemuse-[a-z]+):.*/\1:$1/" .env
}
rollback() {
  log "rolling back to the previous release"
  cp -p .env.prev .env
  docker compose --profile app up -d --remove-orphans
  exit 1
}

set_tags "$tag"
log "migrating"
docker compose --profile migrate run --rm migrate || { cp -p .env.prev .env; log "migration failed; app untouched"; exit 1; }

log "starting web and worker"
docker compose --profile app up -d --remove-orphans

healthy=""
for _ in $(seq 1 30); do
  sleep 4
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)
  running=$(docker compose --profile app ps --status running --format '{{.Service}}' | grep -cE '^(web|worker)$' || true)
  if [ "$code" = 200 ] && [ "$running" = 2 ]; then healthy=1; break; fi
done
[ -n "$healthy" ] || { log "health check failed (http $code, $running/2 running)"; rollback; }

log "healthy; pruning old images"
for image in web worker migrate; do
  docker image ls "easemuse-$image" --format '{{.CreatedAt}}\t{{.Tag}}' | sort -r | tail -n +$((KEEP + 1)) | cut -f2 |
    while read -r old; do [ "$old" = "$tag" ] || docker image rm "easemuse-$image:$old" >/dev/null || true; done
done
docker image prune -f >/dev/null
log "done"
