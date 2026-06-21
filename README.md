# Dream Code

**Even while you sleep, your dreams keep building.**

Dream Code is a fast, Termux-first coding harness CLI. It keeps the base small
and the TUI smooth, while giving you the power tools expected from modern coding
agents: durable sessions, model routing, skills, agents, swarm fan-out, compact
context, workflow recipes, and YOLO mode.

```text
Dream Code (v0.1.0)
Even while you sleep, your dreams keep building. ☾
directory:   ~/dev/project/dream-code
```

## Install

Termux, macOS, and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/parkjangwon/dream-code/main/install.sh | sh
```

Windows PowerShell:

```powershell
npm install -g github:parkjangwon/dream-code; dream
```

Run Dream Code with:

```sh
dream
```

## Uninstall

Termux, macOS, and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/parkjangwon/dream-code/main/uninstall.sh | sh
```

Windows PowerShell:

```powershell
npm uninstall -g dream-code
```

## Core Features

- **Fast TUI:** slash commands, history, menus, skill autocomplete, smooth
  streaming, and Esc double-tap interrupt.
- **Termux-first:** built for Android Termux, with macOS, Linux, and Windows CLI
  support.
- **Model routing:** use one provider by default, or enable multi-provider
  routing for cost, speed, and capability tradeoffs.
- **Agents and swarm:** delegate normal subagent work, or unleash Dream Swarm
  for high-parallel fan-out when speed matters.
- **Context memory:** compact long sessions, keep checkpoints, and preserve task
  progress without flooding every request.
- **Workflow as code:** run project-local JavaScript workflows with `agent()`,
  `parallel()`, `pipeline()`, file helpers, globbing, traces, and starter
  templates.
- **Project awareness:** load `AGENTS.md`, `DESIGN.md`, plans, tasks, sessions,
  LSP diagnostics, live MCP tools, hooks, and local tool health.

## Providers

Dream Code is env-first. If an API key already exists, `/login` can use it
without asking again. Otherwise, connect from the TUI and credentials are saved
to `~/.dream/credentials.json`.

Supported provider targets:

```text
openai, deepseek, opencode-go, opencode-zen, minimax, kimi, z-ai, gemini,
xiaomi-mimo, openrouter, groq, xai, mistral, together, fireworks, cerebras,
qwen, custom-openai
```

OpenAI supports API key credentials and Codex/ChatGPT OAuth-style credentials.

## Commands

```text
/add-dir      Add a workspace directory
/agents       Delegate tasks and manage subagents
/artifact     View saved artifacts
/btw          Ask a side question
/compact      Compact current session context
/copy         Copy the latest assistant response
/doctor       Check local tools
/exit         Exit Dream Code
/export       Export the current conversation
/goal         Start or inspect goal mode
/help         Show commands
/hooks        Show hook settings and recent runs
/interview    Align on implementation direction
/login        Connect a provider
/logout       Forget provider credentials
/lsp          Run project diagnostics
/mcp          Show MCP settings and live tools
/model        Choose model or model routing mode
/plan         Create an implementation plan
/provider     Switch provider or list connections
/rename       Rename current session
/research     Research with source discipline
/review       Review current work
/rules        Show loaded AGENTS.md and DESIGN.md context
/session      Open saved sessions
/skills       Show and toggle installed skills
/status       Show goal, tasks, and model health
/swarm        Run high-parallel agent swarm
/tasks        Show or update task ledger
/verify       Plan verification checks
/workflow     Run saved JavaScript workflow recipes
/yolo         Toggle saved bypass mode
```

## Keyboard

```text
?           Show keyboard shortcuts
Ctrl+L      Redraw the header without losing status
Up/Down     Browse command history or menus
Left/Right  Move cursor
Ctrl+A/E    Move to start/end
Ctrl+U/K    Clear before/after cursor
/           Open slash command menu
@           Open skill autocomplete
Esc Esc     Interrupt a running agent
Enter       Submit input or choose a menu item
```

## Feature List

- Minimal TypeScript CLI core with a fast terminal UI
- Single-provider low/mid/high model tier selection
- Multi-provider auto model routing and route preview
- Provider login, logout, env detection, and credential storage
- OpenAI API key and OAuth credential support
- Sessions with append-only wire logs and a session picker
- `/rename` for current session naming
- Automatic and manual `/compact`
- Project/global rules loading from `AGENTS.md`
- Design-system context loading from `DESIGN.md`
- Goal mode with judge-style continuation support
- Plan mode with project-local `.dream/plans.md`
- Task ledger with todo/doing/done/blocked states
- Skills from `~/.dream/skills` and `~/.agents/skills`
- `@skill` autocomplete and explicit skill activation
- Claude-style custom agents and running-agent inboxes
- Kimi-inspired Dream Swarm fan-out with live monitor
- Swarm synthesis artifacts and memory absorption
- MiMo-inspired memory layers: project memory, checkpoint, task progress
- Hidden memory writer for compact/checkpoint updates
- Workflow-as-code JavaScript recipes with starter generation
- Web research through `DREAM_RESEARCH_COMMAND` or built-in search fallback
- TypeScript, Rust, Go, and Python diagnostics through `/lsp`
- MCP stdio server discovery and `tools/list` / `tools/call` bridge
- Hook execution with recent run logs
- Local file read/write/edit helpers
- Shell command support with permission mode awareness
- YOLO bypass mode through `dream --yolo` or `/yolo`
- Copy/export conversation helpers
- Ripgrep/fd/jq-friendly local tool checks

## Configuration

Main user-editable settings use TOML. Credentials stay in JSON because they are
app-owned secrets rather than hand-edited configuration.

```text
~/.dream/config.toml             main user settings
~/.dream/models.toml             model routing and tier choices
~/.dream/mcp.toml                MCP server definitions
~/.dream/hooks.toml              preTool/postTool/postCommand hooks
~/.dream/hooks.log.jsonl         recent hook run log
~/.dream/credentials.json        provider credentials
~/.dream/session_index.jsonl     session picker index
~/.dream/sessions/               session state and wire logs
~/.dream/tasks.jsonl             task ledger
~/.dream/model_telemetry.jsonl   model routing health log
~/.dream/artifacts/              generated artifacts
~/.dream/workflows/runs/         workflow run traces
```

Project-local files:

```text
.dream/plans.md
.dream/agents/
.dream/workflows/*.js
.dream/artifacts/
AGENTS.md
DESIGN.md
```

## Termux

```sh
pkg update
pkg install nodejs-lts git ripgrep fd jq
curl -fsSL https://raw.githubusercontent.com/parkjangwon/dream-code/main/install.sh | sh
dream
```

## License

MIT
