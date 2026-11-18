#!/usr/bin/env bash
set -Eeuo pipefail
entorno=${1:-/etc/lonja/compose.env}
base=${2:-/opt/lonja}
exec 9>"$base/operacion.lock"
flock -n 9 || { echo 'Hay otra operación de despliegue o restauración.'; exit 1; }
export VERSION
VERSION=$(cat "$base/version")
[[ "$VERSION" =~ ^sha-[a-f0-9]{40}$ ]] || exit 2
compose() { docker compose --project-name lonja --env-file "$entorno" -f "$base/actual/compose.yaml" --profile ensayo "$@"; }
finalizar() {
  estado=$?
  trap - EXIT
  compose rm -s -f restauracion mariadb-ensayo || true
  compose up -d --wait api client respaldo || estado=1
  exit "$estado"
}
trap finalizar EXIT
compose stop client respaldo api
compose up -d --wait mariadb-ensayo
compose run --rm --no-deps restauracion
