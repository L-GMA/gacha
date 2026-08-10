#!/bin/bash
# Деплой new_DS на прод (Selectel 135.106.178.88, deploy-пользователь по ключу ~/.ssh/gacha_deploy)
set -euo pipefail

PROJ="$(cd "$(dirname "$0")" && pwd)"
SSH="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

echo "== [1/5] Сборка клиента =="
(cd "$PROJ/client" && npm run build)

echo "== [2/5] Загрузка кода сервера =="
rsync -az --delete -e "$SSH" \
  --exclude node_modules --exclude dist --exclude uploads --exclude .env --exclude tsconfig.tsbuildinfo \
  "$PROJ/server/" gacha-prod:/opt/gacha/server/

echo "== [3/5] Загрузка клиента =="
rsync -az --delete -e "$SSH" \
  "$PROJ/client/dist/" gacha-prod:/opt/gacha/client/

echo "== [4/5] Установка зависимостей и сборка сервера на проде =="
$SSH gacha-prod 'cd /opt/gacha/server && npm ci --no-audit --no-fund >/dev/null 2>&1 && npm run build'

echo "== [5/5] Перезапуск =="
$SSH gacha-prod 'sudo systemctl restart gacha-server && sleep 2 && systemctl is-active gacha-server'

echo "== Восстановление desktop-сборки (локальный dist должен оставаться в desktop-режиме) =="
(cd "$PROJ/client" && npm run build:desktop)

echo "== Проверка =="
curl -sf http://127.0.0.1:3000/api/health || $SSH gacha-prod 'curl -s http://127.0.0.1:3000/api/health'
echo
echo "OK: приложение обновлено"
