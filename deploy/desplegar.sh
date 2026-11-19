#!/usr/bin/env bash
set -Eeuo pipefail
# Uso: desplegar.sh SHA /etc/lonja/compose.env /opt/lonja
version=${1:?Falta SHA}
entorno=${2:-/etc/lonja/compose.env}
base=${3:-/opt/lonja}
[[ "$version" =~ ^[a-f0-9]{40}$ ]] || { echo 'SHA inválido'; exit 2; }
[[ "$base" = /* && "$entorno" = /* ]] || exit 2
mkdir -p "$base"
exec 9>"$base/operacion.lock"
flock -n 9 || { echo 'Hay otra operación de despliegue o restauración.'; exit 1; }
nuevo="$base/releases/$version"
anterior=$(readlink -f "$base/actual" || true)
version_anterior=''
[[ ! -f "$base/version" ]] || version_anterior=$(cat "$base/version")
export VERSION="sha-$version"
compose() { docker compose --project-name lonja --env-file "$entorno" -f "$nuevo/compose.yaml" "$@"; }
if [[ "$version_anterior" == "$VERSION" ]]; then
  echo "La entrega $VERSION ya está activa; no se repite el despliegue."
  exit 0
fi
rollback() {
  estado=$?
  trap - ERR
  if [[ "$version_anterior" =~ ^sha-[a-f0-9]{40}$ && -f "$anterior/compose.yaml" ]]; then
    echo "Falló la entrega. Volviendo a $version_anterior."
    VERSION="$version_anterior" docker compose --project-name lonja --env-file "$entorno" -f "$anterior/compose.yaml" up -d --wait --wait-timeout 180 || true
    echo 'Si la migración es incompatible, restaura el respaldo previo siguiendo docs/04-instalacion-y-despliegue.md.'
  else
    echo 'Falló el alta inicial; conserva los volúmenes y revisa los registros.'
  fi
  exit "$estado"
}
trap rollback ERR
if [[ -n "$version_anterior" ]]; then
  # El respaldo usa la imagen y configuración que aún están activas.
  VERSION="$version_anterior" docker compose --project-name lonja --env-file "$entorno" -f "$anterior/compose.yaml" exec -T api node scripts/backup.js
fi
compose pull
compose up -d --wait --wait-timeout 180
dominio=$(sed -n 's/^DOMINIO=//p' "$entorno" | tr -d '\r')
[[ "$dominio" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo 'DOMINIO inválido.'; false; }
curl --fail --retry 5 --retry-delay 3 "https://$dominio/salud"
curl --fail --retry 5 --retry-delay 3 --output /dev/null "https://$dominio/"
printf '%s\n' "$VERSION" > "$base/version"
ln -sfn "$nuevo" "$base/actual"
echo "Entrega $VERSION verificada."
