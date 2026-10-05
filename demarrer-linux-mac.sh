#!/bin/sh
# Démarre Pilote Stocks (Linux ou macOS). Nécessite Node.js 18 ou plus récent.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé. Installez la version LTS depuis https://nodejs.org"
  exit 1
fi
exec node server.js
