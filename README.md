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
/skills
/read <path>
/write <path> <text>
/edit <path> old text => new text
/shell <command>
```

Provider setup is env-first. If Dream Code detects a provider API key, `/login`
uses it without asking again. Otherwise it prompts inside the TUI and stores the
credential in `~/.dream/credentials.json` with owner-only file permissions. Main
user-editable settings live in TOML files; credentials stay in JSON because they
are app-owned secrets rather than hand-edited configuration.

Session history uses a Termux-friendly file layout inspired by Kimi Code:
`~/.dream/session_index.jsonl` for the lightweight picker index and
`~/.dream/sessions/<workspace>/<session>/state.json` plus `wire.jsonl` for
per-session metadata and append-only turns.

Skills are loaded from `~/.dream/skills` and `~/.agents/skills`. A skill can be
a directory with `SKILL.md` or a single Markdown file. Use `/skills` to list or
enable/disable skills, and mention `@skill-name` in a prompt to activate that
skill without injecting every skill into context.

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
