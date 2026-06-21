#!/usr/bin/env sh
set -eu

REPO_URL="${DREAM_CODE_REPO:-https://github.com/parkjangwon/dream-code.git}"
REF="${DREAM_CODE_REF:-main}"
INSTALL_DIR="${DREAM_CODE_INSTALL_DIR:-$HOME/.dream/dream-code}"

say() {
  printf '%s\n' "$1"
}

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    say "Dream Code installer needs '$1'."
    exit 1
  fi
}

need node
need npm
need git

if ! node -e 'const major = Number(process.versions.node.split(".")[0]); process.exit(major >= 22 ? 0 : 1)' >/dev/null 2>&1; then
  say "Dream Code requires Node.js 22 or newer."
  say "Termux: pkg install nodejs-lts"
  exit 1
fi

say "Installing Dream Code..."
mkdir -p "$(dirname "$INSTALL_DIR")"

if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$REF"
  git -C "$INSTALL_DIR" checkout --detach FETCH_HEAD
else
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 --branch "$REF" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
npm install --ignore-scripts
npm run build
node dist/src/cli.js init
npm install -g . --ignore-scripts

say "Dream Code installed."
say "Run: dream"
