#!/bin/sh
# Injects DEMO_PORT into the nginx config template, then starts nginx.
set -e

DEMO_PORT="${DEMO_PORT:-8080}"

sed "s/__DEMO_PORT__/${DEMO_PORT}/g" \
    /etc/nginx/nginx.conf.template \
    > /etc/nginx/conf.d/default.conf

echo "==> nginx: demo port = ${DEMO_PORT}"
exec nginx -g 'daemon off;'
