# Copyright (c) 2026 Team of Wakers
# SPDX-License-Identifier: MIT
#
# docker buildx bake [web|worker|migrate]   (TAG=... PLATFORM=linux/arm64 to override)

variable "TAG" { default = "local" }
variable "PLATFORM" { default = "linux/amd64" }

group "default" { targets = ["web", "worker", "migrate"] }

target "_common" {
  context    = "."
  dockerfile = "Dockerfile"
  platforms  = [PLATFORM]
  output     = ["type=docker"]
}

target "web" {
  inherits = ["_common"]
  target   = "runner"
  tags     = ["easemuse-web:${TAG}"]
}

target "worker" {
  inherits = ["_common"]
  target   = "worker"
  tags     = ["easemuse-worker:${TAG}"]
}

target "migrate" {
  inherits = ["_common"]
  target   = "migrate"
  tags     = ["easemuse-migrate:${TAG}"]
}
