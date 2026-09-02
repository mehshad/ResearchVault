#!/bin/sh
# scripts/container-runtime.sh
# Detect and export CONTAINER_CMD / COMPOSE_CMD for use by setup.sh and other scripts.
#
# Override auto-detection by setting CONTAINER_RUNTIME=docker|podman in .env or shell.
#
# Usage (source this file — do NOT execute it):
#   . "$(dirname "$0")/scripts/container-runtime.sh"

_detect_runtime() {
  if [ -n "$CONTAINER_RUNTIME" ]; then
    printf '%s' "$CONTAINER_RUNTIME"
    return
  fi
  if command -v docker >/dev/null 2>&1; then
    printf 'docker'
  elif command -v podman >/dev/null 2>&1; then
    printf 'podman'
  else
    printf ''
  fi
}

_runtime=$(_detect_runtime)

case "$_runtime" in
  docker)
    CONTAINER_CMD="docker"
    # Prefer the compose v2 plugin; fall back to standalone compose v1
    if docker compose version >/dev/null 2>&1; then
      COMPOSE_CMD="docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
      COMPOSE_CMD="docker-compose"
    else
      printf "${RED}[ERROR]${RESET} Docker Compose is not installed. Install it from https://docs.docker.com/compose/install/\n"
      exit 1
    fi
    ;;
  podman)
    CONTAINER_CMD="podman"
    # Prefer the built-in 'podman compose' (Podman ≥ 4.7); fall back to podman-compose
    if podman compose version >/dev/null 2>&1; then
      COMPOSE_CMD="podman compose"
    elif command -v podman-compose >/dev/null 2>&1; then
      COMPOSE_CMD="podman-compose"
    else
      printf "${RED}[ERROR]${RESET} podman compose is not available.\n"
      printf "  Install it with:  pip3 install podman-compose\n"
      printf "  Or upgrade Podman to ≥ 4.7 for the built-in compose subcommand.\n"
      exit 1
    fi
    ;;
  *)
    printf "${RED}[ERROR]${RESET} Neither Docker nor Podman was found in PATH.\n"
    printf "  Install Docker:  https://docs.docker.com/get-docker/\n"
    printf "  Install Podman:  https://podman.io/getting-started/installation\n"
    exit 1
    ;;
esac

export CONTAINER_CMD COMPOSE_CMD
