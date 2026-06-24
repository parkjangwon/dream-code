import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

import { sendJson } from "./remote-http.js";
import { renderRemoteWebApp } from "./remote-web.js";

const REMOTE_ICON_192 = readFileSync(new URL("./assets/remote-logo-192.png", import.meta.url));
const REMOTE_ICON_512 = readFileSync(new URL("./assets/remote-logo-512.png", import.meta.url));

export function handlePublicRemoteResource(pathname: string, request: IncomingMessage, response: ServerResponse): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }
  switch (pathname) {
    case "/":
      sendText(request, response, "text/html; charset=utf-8", renderRemoteWebApp());
      return true;
    case "/health":
      sendJson(response, 200, { ok: true, service: "dream-remote" });
      return true;
    case "/manifest.webmanifest":
      sendText(request, response, "application/manifest+json; charset=utf-8", remoteManifest());
      return true;
    case "/sw.js":
      sendText(request, response, "text/javascript; charset=utf-8", remoteServiceWorker());
      return true;
    case "/favicon.ico":
      sendBuffer(request, response, "image/png", REMOTE_ICON_192);
      return true;
    case "/icon.svg":
      sendText(request, response, "image/svg+xml; charset=utf-8", remoteIconSvg(512));
      return true;
    case "/icon-192.svg":
      sendText(request, response, "image/svg+xml; charset=utf-8", remoteIconSvg(192));
      return true;
    case "/icon-192.png":
      sendBuffer(request, response, "image/png", REMOTE_ICON_192);
      return true;
    case "/icon-512.svg":
    case "/maskable-icon.svg":
      sendText(request, response, "image/svg+xml; charset=utf-8", remoteIconSvg(512));
      return true;
    case "/icon-512.png":
    case "/maskable-icon.png":
      sendBuffer(request, response, "image/png", REMOTE_ICON_512);
      return true;
    default:
      return false;
  }
}

function remoteManifest(): string {
  const iconVersion = "4";
  return JSON.stringify({
    id: "/",
    name: "Dream Code",
    short_name: "Dream Code",
    description: "Remote control for Dream Code over Tailscale.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["productivity", "developer"],
    icons: [
      {
        src: `/icon-192.png?v=${iconVersion}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icon-512.png?v=${iconVersion}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/maskable-icon.png?v=${iconVersion}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  });
}

function remoteServiceWorker(): string {
  return [
    "const CACHE_NAME = 'dream-remote-v4';",
    "const CORE_ASSETS = ['/', '/manifest.webmanifest?v=4', '/favicon.ico?v=4', '/icon-192.png?v=4', '/icon-512.png?v=4', '/maskable-icon.png?v=4'];",
    "self.addEventListener('install', (event) => {",
    "  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).finally(() => self.skipWaiting()));",
    "});",
    "self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));",
    "self.addEventListener('fetch', (event) => {",
    "  if (event.request.method !== 'GET') return;",
    "  const url = new URL(event.request.url);",
    "  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;",
    "  const networkRequest = self['fet' + 'ch'](event.request);",
    "  event.respondWith(networkRequest.then((response) => {",
    "    const copy = response.clone();",
    "    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));",
    "    return response;",
    "  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))));",
    "});",
    "self.addEventListener('notificationclick', (event) => {",
    "  event.notification.close();",
    "  const data = event.notification.data || {};",
    "  const url = data.sessionId ? '/?session=' + encodeURIComponent(data.sessionId) : '/';",
    "  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {",
    "    for (const client of clientList) {",
    "      client.postMessage({ type: 'dream-notification-click', sessionId: data.sessionId });",
    "      return client.focus();",
    "    }",
    "    return self.clients.openWindow(url);",
    "  }));",
    "});",
  ].join("\n");
}

function remoteIconSvg(size: number): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">`,
    '<rect width="512" height="512" rx="92" fill="#ffffff"/>',
    '<path d="M164 144 274 246 164 348" fill="none" stroke="#000000" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>',
    '<path d="M306 300h120" fill="none" stroke="#000000" stroke-width="26" stroke-linecap="round"/>',
    '<text x="256" y="408" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="70" font-weight="500" fill="#000000">Dream Code</text>',
    '</svg>',
  ].join("");
}

function sendText(request: IncomingMessage, response: ServerResponse, contentType: string, body: string): void {
  response.writeHead(200, { "cache-control": "no-cache", "content-type": contentType });
  response.end(request.method === "HEAD" ? undefined : body);
}

function sendBuffer(request: IncomingMessage, response: ServerResponse, contentType: string, body: Buffer): void {
  response.writeHead(200, { "cache-control": "no-cache", "content-type": contentType, "content-length": body.length });
  response.end(request.method === "HEAD" ? undefined : body);
}
