# EaseMuse demo host — easemuse.demo.interactor.com

Single-VM demo environment on OCI Always Free. Set up 2026-10-08. No secrets in this file;
all secrets were generated on the host and live only in `/opt/easemuse/{.env,app.env}` (mode 600).

## What exists (verified live, survives reboot)

| Piece | Detail |
|---|---|
| Tenancy / region | `interactor`, us-phoenix-1 (home region) |
| Compartment | `easemuse` (child of root) |
| Network | VCN `easemuse-vcn` 10.60.0.0/16, public subnet `easemuse-public-subnet` 10.60.0.0/24, IGW, security list `easemuse-public-sl`: 22/tcp, 80/tcp, 443/tcp, 443/udp |
| Instance | `easemuse-vm-1`, VM.Standard.E2.1.Micro (AMD **x86_64**, 2 vCPU, ~1 GB RAM), PHX-AD-3, Ubuntu 24.04 Minimal, 50 GB boot |
| Public IP | **161.153.29.215** — RESERVED (`easemuse-ip`), survives instance replacement |
| DNS | A `easemuse.demo.interactor.com` → 161.153.29.215, TTL 300, zone `interactor.com` (OCI DNS, compartment `websites`) |
| Object storage | bucket `easemuse-files` (private), namespace `axdlmmrmhtza`, S3 endpoint `https://axdlmmrmhtza.compat.objectstorage.us-phoenix-1.oraclecloud.com` |
| SSH | `ubuntu@` with key-only auth. Current key lives in OCI **Cloud Shell** at `~/.ssh/easemuse_rsa` (Cloud Shell is FIPS: ed25519 rejected, RSA 4096 used) |

### On the VM (`/opt/easemuse`, root-owned, 700)
- `compose.yml` — `postgres` (pgvector/pgvector:pg16, tuned for 1 GB, 127.0.0.1:5432) and `redis`
  (7-alpine, password, 64 MB, `noeviction` for BullMQ, 127.0.0.1:6379) are **running**.
  App services are pre-wired but inactive: `web` (profile `app`, 127.0.0.1:3000), `worker` (profile `app`,
  gets `DATABASE_URL_DATARIGHTS`), `migrate` (profile `migrate`).
- `.env` — compose vars: generated DB/Redis passwords + image tags `EASEMUSE_{WEB,WORKER,MIGRATE}_IMAGE`
  (placeholders `easemuse-*:local`).
- `app.env` — full production runtime env (APP_URL, DATABASE_URL as `easemuse_app`, DATABASE_ADMIN_URL as
  `easemuse_owner`, REDIS_URL, AUTH_URL, S3 endpoint/region/bucket, MAIL_FROM, CHROMIUM_PATH=/usr/bin/chromium,
  RENDER_BASE_URL=http://web:3000) plus the values entered on the host: S3 access key pair, Interactor
  OAuth client, Anthropic and Voyage API keys. SMTP is not configured (mail is captured, not sent).
- DB roles (created by `initdb/10-easemuse.sh`): `easemuse_owner` (owns DB + schema public, runs migrations),
  `easemuse_app` (runtime, NOBYPASSRLS), `easemuse_datarights` (worker only, ADR-016). None superuser.
  `vector` extension pre-created by postgres superuser (owner can't create it).
- Caddy (systemd): Let's Encrypt cert (auto-renew), HTTP→HTTPS 308, HSTS, `reverse_proxy 127.0.0.1:3000`
  with `flush_interval -1` (SSE), maintenance page `/var/www/easemuse-maintenance` on 502/503/504.
- Host: 4 GB swap, iptables 80/443 opened + persisted in `/etc/iptables/rules.v4`, sshd keys-only,
  unattended-upgrades, docker log rotation, nightly `pg_dump` (`/etc/cron.d/easemuse-backup` → `/opt/easemuse/backups`, 7 days, LOCAL only).
- Re-runnable bootstrap: `bootstrap.sh` in this folder (idempotent; never regenerates existing secrets).

## App release (live since 2026-10-08)

- Images: `Dockerfile` + `docker-bake.hcl` at the repo root build `easemuse-{web,worker,migrate}` for
  **linux/amd64** (the micro VM is x86). web = Next.js standalone; worker = esbuild bundle + traced
  packages + Debian `chromium` at `/usr/bin/chromium` + Noto CJK fonts; migrate = Prisma CLI only.
  Never build on the 1 GB VM.
- `app.env` also holds `AUTH_URL=https://easemuse.demo.interactor.com`: without it Auth.js builds the
  sign-in callback from the standalone server's bind address (`https://0.0.0.0:3000/...`).
- Account Server application (org `teamofwakers`): grant types **Authorization Code + Client
  Credentials**, redirect URI `https://easemuse.demo.interactor.com/api/auth/callback/interactor`.
- First platform owner: sign in once, then set `User.platformRole` (same statements as
  `pnpm admin:grant`, run with `psql -U easemuse_owner` in the postgres container). Users join agencies
  through invitation links that the inviter copies from the app (no SMTP needed).

## Continuous deploy: main -> production

`.github/workflows/deploy-demo.yml` runs after `ci` passes on a push to `main` (or by hand from the
Actions tab). It skips commits that are no longer main's head, builds the three images on the runner
(GitHub Actions cache), and streams them over SSH to the host:

```
docker save easemuse-{web,worker,migrate}:<sha12> | gzip | ssh easemuse-deploy@161.153.29.215 "deploy <sha12>"
```

On the host, `easemuse-deploy` is a locked user whose only key is `restrict`ed to
`sudo -n /opt/easemuse/bin/deploy "<request>"`, and sudo allows only that script
(`deploy.sh` here, installed by `install-deploy.sh`). The script takes a lock, `docker load`s,
sets the tags in `.env`, runs migrations (forward-only), starts web + worker, and health-checks
(`/` answers 200, both containers running) for up to 2 minutes; on failure it restores the previous
tags. It keeps the last 3 releases of each image. Manual rollback: edit the tags in
`/opt/easemuse/.env` to an older `<sha12>` and `docker compose --profile app up -d`.

GitHub settings: secret `DEMO_DEPLOY_SSH_KEY` (private half of the deploy key, ed25519) and
variable `DEMO_SSH_KNOWN_HOSTS` (`ssh-keyscan 161.153.29.215`). Rotate: generate a new key, rerun
`install-deploy.sh` with its public half, update the secret.

### S3 IAM snippet (run in OCI Cloud Shell; key never printed)
```bash
C=$(oci iam compartment list -c $OCI_TENANCY --name easemuse --query 'data[0].id' --raw-output)
G=$(oci iam group create --name easemuse-s3 --description "EaseMuse bucket access" --query data.id --raw-output)
U=$(oci iam user create --name easemuse-s3 --description "EaseMuse app S3 user" --query data.id --raw-output)
oci iam group add-user --group-id $G --user-id $U
oci iam user update-user-capabilities --user-id $U --can-use-console-password false --can-use-api-keys false --can-use-auth-tokens false --can-use-smtp-credentials false --can-use-customer-secret-keys true
cat > /tmp/pol.json <<'J'
["Allow group easemuse-s3 to read buckets in compartment easemuse","Allow group easemuse-s3 to manage objects in compartment easemuse where target.bucket.name='easemuse-files'"]
J
oci iam policy create -c $C --name easemuse-s3 --description "EaseMuse bucket access" --statements file:///tmp/pol.json
K=$(oci iam customer-secret-key create --user-id $U --display-name easemuse-vm-1)
printf 'S3_ACCESS_KEY_ID=%s\nS3_SECRET_ACCESS_KEY=%s\n' "$(jq -r .data.id <<<"$K")" "$(jq -r .data.key <<<"$K")" \
  | ssh -i ~/.ssh/easemuse_rsa ubuntu@161.153.29.215 'sudo tee -a /opt/easemuse/app.env >/dev/null'; unset K
```

### Giving a local machine SSH access
The only authorized key is the Cloud Shell one. To SSH from a Mac/Linux box, append its **public** key from
Cloud Shell: `ssh -i ~/.ssh/easemuse_rsa ubuntu@161.153.29.215 'cat >> ~/.ssh/authorized_keys' <<< "<contents of ~/.ssh/id_ed25519.pub>"`.
Never copy the private key around.

## Known gaps / trade-offs
- 1 GB RAM: web + worker(Chromium) + Postgres + Redis rely on swap; expect slow PDF renders. Fine for a demo,
  not for load. Next step up (still free) would be an A1.Flex, but tenancy A1 capacity is used by OKE.
- Backups are on the same boot volume; add off-box copy (e.g. to the bucket) before real data.
- No SMTP → mail captured, not sent. SSH open to 0.0.0.0/0 (key-only); tighten to known IPs if desired.
- Boot volume may incur small storage cost if tenancy's 200 GB Always Free block allowance is used by OKE.
