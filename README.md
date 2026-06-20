# Dream Code

**잠든 사이에도, 당신의 꿈은 빌드됩니다.**

Dream Code is a Termux-first coding harness CLI. The MVP is intentionally small:
a simple TUI shell, persistent config, YOLO mode, model-mode scaffolding, and an
environment doctor.

```sh
npm install -g dream-code
dream
dream --yolo
```

Inside the TUI:

```text
/status
/doctor
/yolo
/providers
/login <provider> [region]
/read <path>
/write <path> <text>
/edit <path> old text => new text
/shell <command>
```

Provider setup is env-first. If Dream Code detects a provider API key, `/login`
uses it without asking again. Otherwise it prompts inside the TUI and stores the
credential in `~/.dream/credentials.json` with owner-only file permissions.

Current built-in providers:

```text
openai, deepseek, opencode-go, opencode-zen, minimax, kimi, z-ai, gemini,
xiaomi-mimo, openrouter, groq, xai, mistral, together, fireworks, cerebras,
qwen, custom-openai
```

TUI keys:

```text
?           show keyboard shortcuts
Ctrl+L      redraw the header without losing status
Up/Down     browse command history
Left/Right  move cursor
Ctrl+A/E    move to start/end
Ctrl+U/K    clear before/after cursor
/           open the slash command menu
Enter       submit input or choose a slash command
```

For Termux:

```sh
pkg update
pkg install nodejs-lts git ripgrep fd jq
npm install -g dream-code
dream
```
