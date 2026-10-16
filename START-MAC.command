#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it from https://nodejs.org (LTS), then open this file again."
  open https://nodejs.org
  read -p "Press Enter to close"
  exit 1
fi
[ -d node_modules ] || { echo "Installing for the first time. This takes about a minute..."; npm install; }
echo "Starting the app at http://localhost:5173 . Keep this window open."
npm run dev
