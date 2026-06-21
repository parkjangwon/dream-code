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

Run the same command again to update. The installer uses the latest GitHub
Release package when available, then falls back to a source build before the
first release exists.

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

## Release

Dream Code releases are built as npm tarballs with compiled `dist/` files
inside the GitHub Release asset. The repository does not commit `dist/`.

Create a release by pushing a version tag:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The release workflow runs `npm ci`, `npm test`, `npm pack`, uploads
`dream-code-*.tgz`, and writes `SHA256SUMS`. To build releases on an OCI VM,
register that VM as a GitHub Actions self-hosted runner and set the repository
variable `DREAM_RELEASE_RUNNER` to the runner label, for example
`dream-code-oci`.

Useful installer overrides:

```sh
DREAM_CODE_VERSION=v0.1.0 sh install.sh
DREAM_CODE_SOURCE=1 sh install.sh
```

## Core Features

- **Fast TUI:** slash commands, history, menus, skill autocomplete, smooth
  streaming, and Esc double-tap interrupt.
- **Termux-first:** built for Android Termux, with macOS, Linux, and Windows CLI
  support.
- **Auto model routing:** use one provider by default, or switch on `/auto` to
  route each prompt, agent, and swarm lane across connected providers with
  fallback chains. Connect at least one provider with `/login` before enabling
  it.
- **Provider cost control:** disable expensive env-detected providers with
  `/provider disable <provider>` and re-enable them when needed.
- **Agents and swarm:** delegate normal subagent work, or unleash Dream Swarm
  for high-parallel fan-out when speed matters. Use `/swarm --size N` when you
  want to force a specific number of parallel lanes.
- **Plugin import:** import Claude Code plugin packages into Dream Code skills,
  agents, command skills, and MCP settings with `/plugin install`.
- **Context memory:** compact long sessions, keep checkpoints, and preserve task
  progress without flooding every request.
- **Native notifications:** completion and permission-required alerts through
  standard OS notification tools, with hook-friendly command overrides.
- **Workflow as code:** run project-local JavaScript workflows with `agent()`,
  `parallel()`, `pipeline()`, file helpers, globbing, traces, and starter
  templates.
- **Project awareness:** load `AGENTS.md`, `DESIGN.md`, plans, tasks, sessions,
  LSP diagnostics, live MCP tools, hooks, and local tool health.
- **Workspace control:** let the agent list, search, read, create directories,
  write files, edit files, delete files, run shell commands, and research the
  web with permission-aware prompts.

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

## Dream Swarm

Dream Swarm fans a task out across multiple specialized agents, shows a live
monitor, then merges the lanes into one final synthesis.

```text
/swarm analyze this project
/swarm --size 10 run a security review
```

Without `--size`, Dream Code uses adaptive fan-out. With `--size N`, Dream Code
forces exactly `N` swarm lanes, useful when you want to push a large job hard and
spend more tokens for faster parallel coverage.

## Commands

```text
/add-dir      Add a workspace directory
/agents       Delegate tasks and manage subagents
/artifact     View saved artifacts
/auto         Toggle automatic model routing
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
/notifications Toggle native completion and permission alerts
/plan         Create an implementation plan
/plugin       Import Claude plugin packages
/provider     Switch, list, enable, or disable providers
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
- Cursor-style `/auto` mode with connected-provider bootstrap
- Multi-provider category and agent route chains in `~/.dream/models.toml`
- Live model discovery for every connected supported provider
- Same-turn model failover when a route candidate is unavailable
- Model route preview and telemetry-aware health filtering
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
- Claude plugin import for skills, agents, commands, and `.mcp.json`
- Custom agents and running-agent inboxes
- Dream Swarm fan-out with live monitor
- Swarm synthesis artifacts and memory absorption
- Memory layers: project memory, checkpoint, task progress
- Hidden memory writer for compact/checkpoint updates
- Workflow-as-code JavaScript recipes with starter generation
- Agent file tools for list, search, read, mkdir, write, edit, and delete
- Web research through `DREAM_RESEARCH_COMMAND` or built-in DuckDuckGo fallback
- TypeScript, Rust, Go, Python, and Java diagnostics through `/lsp`
- MCP stdio server discovery and `tools/list` / `tools/call` bridge
- Hook execution with recent run logs
- Local file read/write/edit helpers
- Shell command support with permission mode awareness
- Native OS notifications for long completions and permission-required states
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
~/.dream/model_catalog.json      cached live provider model lists
~/.dream/session_index.jsonl     session picker index
~/.dream/sessions/               session state and wire logs
~/.dream/tasks.jsonl             task ledger
~/.dream/model_telemetry.jsonl   model routing health log
~/.dream/artifacts/              generated artifacts
~/.dream/plugins/                imported Claude plugin sources and registry
~/.dream/workflows/runs/         workflow run traces
```

Notification settings live in `~/.dream/config.toml`:

```toml
[notifications]
enabled = true
completion = true
permissionRequired = true
minCompletionMs = 10000
```

Dream Code uses `termux-notification`, `osascript`, `notify-send`, or
PowerShell depending on the platform. Set `DREAM_NOTIFICATION_COMMAND` if you
want to route notifications through your own hook command.

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
pkg -y update
pkg -y install nodejs-lts git ripgrep fd jq
curl -fsSL https://raw.githubusercontent.com/parkjangwon/dream-code/main/install.sh | sh
dream
```

For shared Android storage such as `/sdcard`, run `termux-setup-storage` once
and grant storage permission. Project files under Termux home work without that
extra Android storage grant.

## License

MIT
