#!/usr/bin/env sh
set -eu

REPO_URL="${DREAM_CODE_REPO:-https://github.com/parkjangwon/dream-code.git}"
REF="${DREAM_CODE_REF:-main}"
GITHUB_REPOSITORY="${DREAM_CODE_GITHUB_REPOSITORY:-parkjangwon/dream-code}"
VERSION="${DREAM_CODE_VERSION:-latest}"
SOURCE_INSTALL="${DREAM_CODE_SOURCE:-0}"
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

installed_already() {
  [ -d "$INSTALL_DIR/.git" ] || command -v dream >/dev/null 2>&1
}

release_asset_url() {
  DREAM_CODE_GITHUB_REPOSITORY="$GITHUB_REPOSITORY" DREAM_CODE_VERSION="$VERSION" node <<'NODE'
const repo = process.env.DREAM_CODE_GITHUB_REPOSITORY ?? "parkjangwon/dream-code";
const version = process.env.DREAM_CODE_VERSION ?? "latest";
const api = version === "latest"
  ? `https://api.github.com/repos/${repo}/releases/latest`
  : `https://api.github.com/repos/${repo}/releases/tags/${version}`;

(async () => {
  try {
    const response = await fetch(api, { headers: { "user-agent": "Dream Code installer" } });
    if (!response.ok) {
      process.exit(1);
    }
    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = assets.find((item) => {
      return typeof item.name === "string"
        && /^dream-code-[0-9][^/]*\.tgz$/.test(item.name)
        && typeof item.browser_download_url === "string";
    });
    if (asset === undefined) {
      process.exit(1);
    }
    console.log(asset.browser_download_url);
  } catch {
    process.exit(1);
  }
})();
NODE
}

install_dependencies() {
  if [ -f package-lock.json ]; then
    npm ci --ignore-scripts
  else
    npm install --ignore-scripts
  fi
}

run_installed_init() {
  if command -v dream >/dev/null 2>&1; then
    dream init
  else
    node "$(npm root -g)/dream-code/dist/src/cli.js" init
  fi
}

need node
need npm

if ! node -e 'const major = Number(process.versions.node.split(".")[0]); process.exit(major >= 22 ? 0 : 1)' >/dev/null 2>&1; then
  say "Dream Code requires Node.js 22 or newer."
  say "Termux: pkg install nodejs-lts"
  exit 1
fi

if installed_already; then
  ACTION="updated"
  say "Updating Dream Code..."
else
  ACTION="installed"
  say "Installing Dream Code..."
fi

mkdir -p "$(dirname "$INSTALL_DIR")"

if [ "$SOURCE_INSTALL" != "1" ]; then
  ASSET_URL="$(release_asset_url || true)"
  if [ -n "$ASSET_URL" ]; then
    say "Installing release package: $ASSET_URL"
    npm install -g "$ASSET_URL" --ignore-scripts
    run_installed_init
    say "Dream Code $ACTION."
    say "Run: dream"
    exit 0
  fi
  say "No release package found. Falling back to source install."
fi

need git

if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" remote set-url origin "$REPO_URL"
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$REF"
  git -C "$INSTALL_DIR" checkout --detach FETCH_HEAD
else
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 --branch "$REF" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
install_dependencies
npm run build
node dist/src/cli.js init
npm install -g "$INSTALL_DIR" --ignore-scripts

say "Dream Code $ACTION."
say "Run: dream"
