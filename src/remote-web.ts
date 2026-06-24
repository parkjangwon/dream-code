import { REMOTE_WEB_CSS, REMOTE_WEB_JS } from "./remote-web-assets.js";

export function renderRemoteWebApp(): string {
  const iconVersion = "4";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#000000">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Dream Code">
<meta name="msapplication-TileColor" content="#000000">
<meta name="msapplication-TileImage" content="/icon-512.png?v=${iconVersion}">
<meta property="og:image" content="/icon-512.png?v=${iconVersion}">
<link rel="manifest" href="/manifest.webmanifest?v=${iconVersion}">
<link rel="shortcut icon" href="/favicon.ico?v=${iconVersion}">
<link rel="icon" href="/favicon.ico?v=${iconVersion}" sizes="any">
<link rel="icon" href="/icon-192.png?v=${iconVersion}" type="image/png" sizes="192x192">
<link rel="icon" href="/icon-512.png?v=${iconVersion}" type="image/png" sizes="512x512">
<link rel="apple-touch-icon" href="/icon-192.png?v=${iconVersion}" sizes="192x192">
<link rel="apple-touch-icon" href="/icon-512.png?v=${iconVersion}" sizes="512x512">
<title>Dream Code</title>
<style>${REMOTE_WEB_CSS}</style>
</head>
<body>
<div id="app"></div>
<script>${REMOTE_WEB_JS}</script>
</body>
</html>
`;
}
