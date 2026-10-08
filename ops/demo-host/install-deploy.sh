#!/usr/bin/env bash
# Copyright (c) 2026 Team of Wakers
# SPDX-License-Identifier: MIT
#
# One-time (idempotent) setup for CI deploys, run as root on the demo host:
#   sudo bash install-deploy.sh /path/to/deploy.sh "<ssh-ed25519 public key of the CI deploy key>"
# Creates the locked `easemuse-deploy` user whose key can run ONLY /opt/easemuse/bin/deploy:
# no shell, no forwarding, no PTY (`restrict`), sudo limited to that one script.
set -euo pipefail
SRC=${1:?deploy.sh path}; KEY=${2:?public key}
[[ $KEY =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+( .*)?$ ]] || { echo "expected one ssh-ed25519 public key" >&2; exit 2; }
U=easemuse-deploy

install -d -o root -g root -m 0755 /opt/easemuse/bin
install -o root -g root -m 0755 "$SRC" /opt/easemuse/bin/deploy

id "$U" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/sh "$U"
passwd -l "$U" >/dev/null
install -d -o "$U" -g "$U" -m 0700 "/home/$U/.ssh"
printf 'restrict,command="sudo -n /opt/easemuse/bin/deploy \\"$SSH_ORIGINAL_COMMAND\\"" %s\n' "$KEY" > "/home/$U/.ssh/authorized_keys"
chown "$U:$U" "/home/$U/.ssh/authorized_keys"; chmod 0600 "/home/$U/.ssh/authorized_keys"

echo "$U ALL=(root) NOPASSWD: /opt/easemuse/bin/deploy" > /etc/sudoers.d/easemuse-deploy
chmod 0440 /etc/sudoers.d/easemuse-deploy
visudo -cf /etc/sudoers.d/easemuse-deploy >/dev/null
echo "deploy user ready: $U"
