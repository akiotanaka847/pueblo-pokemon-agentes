#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Langfuse en local para monitorizar a los agentes.
#
#  Usa el docker-compose OFICIAL de Langfuse, con dos correcciones que el
#  archivo pide expresamente (las marca con "CHANGEME"):
#
#   1. Secretos aleatorios. Por defecto trae valores conocidos (mysecret,
#      mysalt, clave de cifrado a ceros, postgres:postgres…): con ellos
#      cualquiera podría falsificar una sesión.
#   2. Todo atado a 127.0.0.1. Por defecto la web (3000) y el almacenamiento
#      (9090) escuchan en todas las interfaces, es decir, en tu wifi.
#
#  Los secretos se guardan FUERA del repositorio, en $LANGFUSE_DIR/.env.
#
#  Uso:
#    tools/langfuse-local.sh          → descarga, configura y arranca
#    tools/langfuse-local.sh check    → configura y comprueba, SIN arrancar
#    tools/langfuse-local.sh stop     → para los contenedores (conserva datos)
#    tools/langfuse-local.sh reset    → para y BORRA todos los datos
# ─────────────────────────────────────────────────────────────
set -euo pipefail

DIR="${LANGFUSE_DIR:-$HOME/langfuse-local}"
COMPOSE_URL="https://raw.githubusercontent.com/langfuse/langfuse/main/docker-compose.yml"

mkdir -p "$DIR"
cd "$DIR"

case "${1:-up}" in
  stop)  docker compose down;    exit 0 ;;
  reset) docker compose down -v; exit 0 ;;
esac

docker info >/dev/null 2>&1 || { echo "❌ Docker no está en marcha. Abre Docker Desktop y reintenta."; exit 1; }

[ -f docker-compose.yml ] || curl -fsSL -o docker-compose.yml "$COMPOSE_URL"

# Secretos: se generan una sola vez. Regenerarlos con datos ya creados
# dejaría la base de datos inaccesible, por eso no se pisan si existen.
if [ ! -f .env ]; then
  umask 077
  hex() { openssl rand -hex "$1"; }
  PG=$(hex 16); MINIO=$(hex 16)
  cat > .env <<EOF
# Generado por tools/langfuse-local.sh — NO compartir.
POSTGRES_PASSWORD=$PG
DATABASE_URL=postgresql://postgres:$PG@postgres:5432/postgres
CLICKHOUSE_PASSWORD=$(hex 16)
REDIS_AUTH=$(hex 16)
MINIO_ROOT_PASSWORD=$MINIO
LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY=$MINIO
LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY=$MINIO
LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY=$MINIO
NEXTAUTH_SECRET=$(hex 32)
SALT=$(hex 16)
ENCRYPTION_KEY=$(hex 32)
TELEMETRY_ENABLED=false
EOF
  echo "✓ secretos generados en $DIR/.env"
fi

# `!override` reemplaza la lista de puertos del archivo oficial. Sin él,
# Compose SUMA las listas y el puerto quedaría abierto igualmente.
cat > docker-compose.override.yml <<'EOF'
services:
  langfuse-web:
    ports: !override
      - 127.0.0.1:3000:3000
  minio:
    ports: !override
      - 127.0.0.1:9090:9000
      - 127.0.0.1:9091:9001
EOF

# Comprobación: ningún puerto publicado fuera de 127.0.0.1.
ABIERTOS=$(docker compose config --format json | python3 -c '
import json,sys
cfg=json.load(sys.stdin)
for nombre,svc in cfg.get("services",{}).items():
    for p in svc.get("ports",[]) or []:
        ip=p.get("host_ip","") if isinstance(p,dict) else ""
        if ip not in ("127.0.0.1","::1"):
            print("%s:%s" % (nombre, p.get("published") if isinstance(p,dict) else p))
')
if [ -n "$ABIERTOS" ]; then
  echo "❌ Puertos abiertos a la red, no arranco: $ABIERTOS"; exit 1
fi
echo "✓ todos los puertos atados a 127.0.0.1"

[ "${1:-up}" = "check" ] && exit 0

docker compose up -d
echo
echo "Langfuse arrancando en http://localhost:3000 (tarda 1-2 minutos la primera vez)."
