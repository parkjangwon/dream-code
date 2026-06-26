import { readFileSync } from "node:fs";

export const REMOTE_WEB_CSS = readAsset("remote-web.css");
export const REMOTE_WEB_JS = readAsset("remote-web-app.bundle.js");

function readAsset(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}
