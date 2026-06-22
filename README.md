# Dream Code

**Even while you sleep, your dreams keep building.**

<img width="666" height="540" alt="image" src="https://github.com/user-attachments/assets/b79d34d1-2718-4b11-85ee-d40660890ae5" />

Dream Code is a fast, Termux-first AI Coding Agent. It keeps the base small
and the TUI smooth, while giving you the power tools expected from modern coding
agents: durable sessions, model routing, skills, agents, swarm fan-out, cron
automation, compact context, workflow recipes, and YOLO mode.

## Direction

Dream Code is built around trust, autonomy, and mobility. It is not meant to be
only a chat box for code: it should behave like a coding companion you can leave
with a goal while you sleep, then return to a clear checkpoint, artifact, or
finished change.

That direction shapes the runtime loop:

- **Goal-first execution:** keep moving toward the user’s goal instead of asking
  for routine confirmation.
- **Autonomous judgment:** inspect the repository, research unclear concepts,
  choose safe next steps, and verify before claiming success.
- **Mobile-first operations:** stay fast and readable on Termux and small
  terminals, with collapsed tool output and concise status surfaces.
- **Smart resource use:** route work across providers and models so simple work
  stays cheap and hard work gets stronger models.
- **Overdrive when needed:** use Dream Swarm for high-parallel work when the user
  wants speed more than token thrift.
- **Memory as trust:** preserve decisions, checkpoints, task progress, and
  artifacts so long-running work remains understandable.

```text
Dream Code (v0.1.11)
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

Run one prompt non-interactively from scripts, hooks, or another shell:

```sh
dream -p "summarize this repository"
dream --yolo -p "fix the failing tests"
dream -p "inspect the current git state" --json --quiet
```

Check workday readiness before editing, testing, or releasing:

```sh
dream workday --dry-run
dream workday --dry-run --json
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
git tag v0.1.11
git push origin v0.1.11
```

The release workflow runs `npm ci`, `npm test`, `npm pack`, uploads
`dream-code-*.tgz`, and writes `SHA256SUMS`.

Useful installer overrides:

```sh
DREAM_CODE_VERSION=v0.1.11 sh install.sh
DREAM_CODE_SOURCE=1 sh install.sh
```

## Core Features

- **Fast TUI:** slash commands, slash skill autocomplete, `@` file mentions,
  history, menus, smooth streaming, and Esc double-tap interrupt.
- **Autonomous by default:** Dream Code favors completion over clarification,
  uses research when a concept is unclear, and verifies before reporting
  success.
- **Termux-first:** built for Android Termux, with macOS, Linux, and Windows CLI
  support.
- **Auto model routing:** use one provider by default, or switch on `/auto` to
  route each prompt, agent, and swarm lane across connected providers with
  fallback chains. Connect at least one provider with `/login` before enabling
  it.
- **Provider cost control:** disable expensive env-detected providers with
  `/provider disable <provider>` and re-enable them when needed.
- **Agents and swarm:** open the `/agents` board to inspect, peek, reply to, and
  stop subagent sessions, or unleash Dream Swarm for high-parallel fan-out when
  speed matters. Use `/swarm --deep` for adaptive coverage, `/swarm --overdrive`
  for adversarial high-pressure review, or `/swarm --lanes N` when you want to
  force a specific number of parallel lanes.
- **Claude Code compatibility:** load `CLAUDE.md`, `CLAUDE.local.md`,
  `.claude/rules/*.md`, and `.claude/skills`, while keeping existing
  `AGENTS.md`, `DESIGN.md`, and Dream skills support.
- **Plugin import:** import Claude Code plugin packages into Dream Code skills,
  agents, command skills, and MCP settings with `/plugin install`.
- **Plugin marketplaces:** install from the built-in
  `claude-plugins-official` marketplace, add/remove Claude-style marketplaces
  with `/plugin marketplace add <source>` and the remove command, and search
  plugins before installing.
- **Dreaming memory:** when an interactive session ends, Dream Code reviews the
  session and promotes durable lessons into project memory: user preferences,
  repeatable workflows, project truths, and mistakes to avoid.
- **Session continuity:** recent turns are injected into the next model call as
  fenced background context, so weaker/low-tier models keep track of the live
  back-and-forth without treating recalled context as a fresh user request.
- **Context memory:** compact long sessions, keep checkpoints, inspect loaded
  context with `/context`, and preserve task progress without flooding every
  request.
- **Native notifications:** completion and permission-required alerts through
  standard OS notification tools, with hook-friendly command overrides.
- **Cron automation:** schedule recurring agent work from the TUI, run it from a
  background daemon, and let jobs call normal prompts, `/workflow`, or `/swarm`.
- **Workflow as code:** run project-local JavaScript workflows with `agent()`,
  `parallel()`, `pipeline()`, file helpers, globbing, traces, and starter
  templates.
- **Project awareness:** load `AGENTS.md`, `DESIGN.md`, plans, tasks, sessions,
  LSP diagnostics, live MCP tools, hooks, and local tool health.
- **Workspace control:** let the agent list, search, read, create directories,
  write files, edit files, delete files, run shell commands, and research the
  web. Fresh installs start in YOLO bypass mode; use `/yolo` to toggle back to
  ask mode when you want approval prompts. Existing files are checkpointed under
  `~/.dream/file-history/` before write/edit/delete tools mutate them.

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
/swarm --deep run a security review
/swarm --overdrive pressure-test the release
/swarm --lanes 10 run a broad compatibility audit
/swarm --lanes 25 --overdrive wake the whole dream
```

Without options, Dream Code uses a standard adaptive fan-out and picks
task-specific lanes from the goal. Use `--light`, `--standard`, `--deep`, or
`--max` to increase coverage while still letting Dream choose the best lane mix.
Use `--overdrive` for a sharper 10-lane adversarial pass with failure, security,
regression, performance, integration, and final-judge lanes. Use `--lanes N`
only when you want exactly `N` lanes; combining it with `--overdrive` is the
hidden high-lane path for intentionally noisy stress runs. The older `--size N`
spelling still works as a deprecated alias for cron and existing scripts.

## Agent Board

`/agents` opens a Claude-style agent view with `Running` and `Library` tabs.
Completed sessions stay out of the default view so the board stays quiet. Use
the running tab to open, inspect, reply to, or stop active subagent sessions.

```text
/agents
/agents @code-reviewer review this branch
/agents @security-reviewer audit dependency risk
```

## Claude Plugins

Dream Code can import Claude Code plugins and marketplaces.

```text
/plugin marketplace
/plugin marketplace list
/plugin search commit
/plugin install superpowers@claude-plugins-official
/plugin list
/plugin uninstall superpowers
/plugin marketplace add anthropics/claude-code
/plugin marketplace add ~/plugins/my-marketplace
/plugin marketplace add internal https://example.com/marketplace.json
/plugin marketplace remove internal
```

The built-in official marketplace is named `claude-plugins-official`; `official`
is kept as a short alias. Marketplace sources can be local files/directories,
HTTP JSON URLs, GitHub shorthands like `owner/repo@ref`, or git URLs with
`#ref`. `/plugin list` shows installed plugins; `/plugin uninstall <plugin>`
removes the plugin source, imported skills, imported agents, imported command
skills, and imported MCP server blocks.

## Dreaming

Dreaming is Dream Code's lightweight self-learning loop. On interactive session
exit, it summarizes only durable takeaways and appends deduplicated entries to
the current project's `MEMORY.md`. It deliberately ignores raw logs, secrets,
temporary provider failures, missing local binaries, and one-off task chatter.

The design borrows the practical parts of Hermes Agent's learning loop: separate
short-term session continuity from long-term memory, wrap recalled context in a
clear background-data fence, and keep transient failures from becoming stale
self-imposed rules.

## Cron

Cron schedules recurring Dream Code work. Jobs are grouped by one project level,
stored in `~/.dream/dream.db`, and each run writes a Markdown artifact under
`~/.dream/cron/runs/`.

Jobs can run the same primitives you use interactively: a normal agent prompt,
a saved `/workflow`, or a high-parallel `/swarm` job. That means scheduled work
can use your providers, model routing, skills, MCP tools, hooks, notifications,
workspace file tools, and project rules.

Inside the TUI:

```text
/cron
/cron every day at 09:00 run tests and summarize failures
/cron every day at 02:00 /swarm --deep audit this project
/cron 0 8 * * * /workflow .dream/workflows/morning.js
/cron run nightly
/cron pause nightly
/cron resume nightly
/cron rename nightly morning-check
/cron delete morning-check
```

From the shell:

```sh
dream cron list
dream cron add --name nightly "every day at 09:00 run tests"
dream cron add --name swarm-audit --mode swarm "0 2 * * * /swarm --deep audit this project"
dream cron add --output .dream/cron-results/test-summary.md "every day at 09:00 run tests"
dream cron pause nightly
dream cron resume nightly
dream cron run nightly
dream cron rename nightly morning-check
dream cron delete morning-check
dream cron project list
dream cron project rename dream-code dream-code-cli
dream cron project delete dream-code-cli
dream daemon run-once
dream daemon run --interval 60
```

Supported schedule forms:

```text
every day at 09:00 <prompt>
daily at 09:00 <prompt>
hourly <prompt>
0 8 * * * <prompt>
```

Use your OS service manager to keep the daemon alive, such as systemd on Linux,
launchd on macOS, a Termux boot/service setup on Android, or Task Scheduler on
Windows. `dream daemon run --interval 60` is intentionally a portable foreground
loop, so you can wrap it with the supervisor you already use on each platform.

## Commands

```text
/add-dir      Add a workspace directory
/agents       Delegate tasks and manage subagents
/artifact     View saved artifacts
/auto         Toggle automatic model routing
/btw          Ask a side question
/clear        Clear the active session transcript
/compact      Compact current session context
/context      Show loaded context and plaintext storage notes
/copy         Copy the latest assistant response
/cron         Manage scheduled agent work
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
/permission  Set ask, auto, plan, or yolo permission mode
/plan         Create an implementation plan
/plugin       Manage Claude plugins and marketplaces
/provider     Switch, list, enable, or disable providers
/rename       Rename current session
/research     Research with source discipline
/restore      Restore the latest file checkpoint for a path
/review       Review current work
/rules        Show loaded AGENTS.md, CLAUDE.md, and DESIGN.md context
/session      Open saved sessions
/skills       Show and toggle installed skills
/status       Show goal, tasks, and model health
/swarm        Run high-parallel agent swarm
/tasks        Show or update task ledger
/verify       Plan verification checks
/workday      Show edit-test-review readiness
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
/           Open command and skill menu
@           Mention files and directories
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
- Project/global rules loading from `AGENTS.md`, `CLAUDE.md`,
  `CLAUDE.local.md`, and `.claude/rules/*.md`
- Design-system context loading from `DESIGN.md`
- `/context`, `/clear`, and `/restore` session/context recovery commands
- Goal mode with judge-style continuation support
- Plan command with project-local `.dream/plans.md`
- Read-only `plan` permission mode for no-mutation agent runs
- Task ledger with todo/doing/done/blocked states
- Skills from `~/.dream/skills`, `~/.agents/skills`, `~/.claude/skills`, and
  project `.claude/skills`
- `/skill` autocomplete and explicit skill activation
- `@file` and `@directory/` mentions for explicit context
- Claude plugin import for skills, agents, commands, and `.mcp.json`
- Claude plugin marketplace install from `claude-plugins-official` plus
  `/plugin marketplace add <source>` and `/plugin marketplace remove <name>`
- Installed plugin listing and uninstall cleanup through `/plugin list` and
  `/plugin uninstall <plugin>`
- Custom agents and running-agent inboxes
- Dream Swarm fan-out with live monitor
- Swarm synthesis artifacts and memory absorption
- Memory layers: project memory, checkpoint, task progress
- Hidden memory writer for compact/checkpoint updates
- Workflow-as-code JavaScript recipes with starter generation
- Daemon-backed cron jobs for recurring prompts, workflows, and swarms
- Agent file tools for list, search, read, mkdir, write, edit, and delete
- File history checkpoints before write/edit/delete and `/restore <path>`
- Web research through `DREAM_RESEARCH_COMMAND` or built-in DuckDuckGo fallback
- TypeScript, Rust, Go, Python, and Java diagnostics through `/lsp`
- MCP stdio server discovery and `tools/list` / `tools/call` bridge
- Hook execution with recent run logs
- Local file read/write/edit helpers
- Shell command support with permission mode awareness
- Native OS notifications for long completions and permission-required states
- YOLO bypass mode by default, with `dream --yolo` or `/yolo` for explicit control
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
~/.dream/file-history/           plaintext file checkpoints for restore
~/.dream/model_telemetry.jsonl   model routing health log
~/.dream/dream.db                SQLite store for cron projects, jobs, and runs
~/.dream/cron/runs/              cron run Markdown artifacts
~/.dream/artifacts/              generated artifacts
~/.dream/plugins/                imported Claude plugin sources and registry
~/.dream/workflows/runs/         workflow run traces
```

Dream Code stores sessions, memory, imported plugins, skills, MCP settings, and
file history as plaintext under the Dream config directory. Keep that directory
out of shared backups or untrusted sync folders if your projects contain
sensitive code.

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
CLAUDE.md
CLAUDE.local.md
.claude/rules/*.md
.claude/skills/<name>/SKILL.md
DESIGN.md
```

Set `CLAUDE_CONFIG_DIR` when you want Dream Code to read global Claude memory
and skills from a non-default Claude config directory.

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
