# Dream Code

**잠든 사이에도, 당신의 꿈은 빌드됩니다.**

Dream Code is a Termux-first coding harness CLI. The core stays small while the
TUI exposes the workflows that matter: sessions, provider login, model picking,
skills, agents, swarm fan-out, compact context, hooks, MCP settings, and local
coding tools.

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
/provider
/login
/model
/model auto
/model route <prompt>
/session
/skills
/agents
/swarm --size 8 <goal>
/goal <goal>
/plan <request>
/tasks <task>
/compact
/research <query>
/rules
/hooks
/mcp
```

Provider setup is env-first. If Dream Code detects a provider API key, `/login`
uses it without asking again. Otherwise it prompts inside the TUI and stores the
credential in `~/.dream/credentials.json` with owner-only file permissions. Main
user-editable settings live in TOML files; credentials stay in JSON because they
are app-owned secrets rather than hand-edited configuration.

Model routing starts in single-provider mode. Use `/model` to choose the active
provider model tier, `/model auto` to enable multi-provider routing, `/model
single` to go back, `/model routes` to inspect the configured category chains,
and `/model route <prompt>` to preview which provider/model Dream Code would
choose before sending a real request. Auto routing prefers providers that are
already connected through env keys, saved credentials, or OAuth.

Session history uses a Termux-friendly file layout inspired by Kimi Code:
`~/.dream/session_index.jsonl` for the lightweight picker index and
`~/.dream/sessions/<workspace>/<session>/state.json` plus `wire.jsonl` for
per-session metadata and append-only turns.

Compact context is automatic as sessions grow and can be forced with
`/compact`. Saved compacts are injected back into the next agent prompt so long
sessions stay useful without stuffing the whole transcript into every request.

Skills are loaded from `~/.dream/skills` and `~/.agents/skills`. A skill can be
a directory with `SKILL.md` or a single Markdown file. Use `/skills` to list or
enable/disable skills, and mention `@skill-name` in a prompt to activate that
skill without injecting every skill into context. Type `@` in the TUI input to
open skill autocomplete.

Current built-in providers:

```text
openai, deepseek, opencode-go, opencode-zen, minimax, kimi, z-ai, gemini,
xiaomi-mimo, openrouter, groq, xai, mistral, together, fireworks, cerebras,
qwen, custom-openai
```

Optional settings live beside the main config:

```text
~/.dream/config.toml       main user settings
~/.dream/models.toml       model routing and tier choices
~/.dream/mcp.toml          MCP server definitions
~/.dream/hooks.toml        preTool/postTool/postCommand hooks
~/.dream/credentials.json  provider credentials
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
@           open skill autocomplete
Enter       submit input or choose a slash command
```

For Termux:

```sh
pkg update
pkg install nodejs-lts git ripgrep fd jq
npm install -g dream-code
dream
```
