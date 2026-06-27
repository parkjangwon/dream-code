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
- **Remote control as a first-class surface:** start work on a laptop or server,
  then continue from a phone through a self-hosted web app over Tailscale.
- **Smart resource use:** route work across providers and models so simple work
  stays cheap and hard work gets stronger models.
- **Different gears for different work:** use Goal mode to drive one coding
  objective to a verifiable result, Dream Swarm to review it from many angles,
  and LoopSpec when a real command can judge pass/fail.
- **Memory as trust:** preserve decisions, checkpoints, task progress, and
  artifacts so long-running work remains understandable.

```text
Dream Code (v0.1.40)
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

After Dream Code is installed, update from the CLI with:

```sh
dream update
dream update --check
```

`dream update` checks the latest GitHub Release and reuses the same installer
path as a fresh install. On Termux, macOS, and Linux it runs the published
`install.sh` flow; on Windows it installs the latest release tarball with npm.
Use `--check` when you only want to see whether a newer release exists.

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

## Dream Remote

Dream Remote is one of Dream Code's headline features: a self-hosted mobile web
app for controlling the same Dream Code sessions and projects from your phone.
It is designed for the common "leave the machine running, check and steer it
from your smartphone" workflow.

Start it from the machine that runs Dream Code:

```sh
dream remote start
```

Dream Remote requires Tailscale. `remote start` refuses to start if Tailscale is
missing or stopped, launches a background daemon on localhost, exposes it with
Tailscale Serve, and prints a URL plus a one-time pairing code:

```text
Dream Remote is ready.
open: https://your-device.tailnet.ts.net:9999
pairing code: 123456
```

Useful commands:

```sh
dream remote start              # start on the default 9999 port
dream remote start --port 7777  # start on another port
dream remote status             # print the URL and current pairing code
dream remote stop               # stop the daemon and Tailscale Serve handler
```

Open the printed URL on another Tailscale device, enter the pairing code, and
use the web app like a compact remote control surface: choose a project, open or
rename a thread, start a new thread, send prompts, use remote-safe slash
commands such as `/swarm`, upload files/images for a run, stop running commands,
delete old sessions, and receive completion notifications.

### How It Works

Dream Remote is intentionally personal and self-hosted. There is no cloud relay
and no Dream Code account system.

The flow is:

1. `dream remote start` starts a detached Dream Remote daemon.
2. The daemon listens only on `127.0.0.1:<port>` by default.
3. Tailscale Serve publishes that localhost server to your tailnet.
4. The browser pairs once with the short pairing code and stores a local token.
5. Prompts, slash commands, uploads, live output, sessions, and project lists go
   through the remote daemon to the same local Dream Code runtime.

Projects are remembered by absolute path from Dream Code sessions and workspace
history. When you open a project in Remote, the actual agent work runs in that
project directory, not in a fake UI-only workspace. Remote also refreshes project
and session lists while it is running, so projects opened from the CLI can appear
without restarting the remote daemon.

Logs are written under:

```text
~/.dream/webapp/remote.log
```

The log rotates when it grows too large and keeps compressed archives so the
remote daemon does not fill the disk.

### HTTPS, PWA, And Notifications

For the best mobile experience, use the `https://...tailnet...` URL printed by
`dream remote start`.

Browser notifications, notification-click navigation, and reliable PWA install
behavior require a secure browser context. In practice that means HTTPS. Dream
Remote asks Tailscale Serve for HTTPS first, then falls back to HTTP only when
HTTPS is not available.

If the printed URL starts with `http://`, the remote web app can still work over
your tailnet, but browser notifications and PWA install prompts may be blocked or
inconsistent. Enable HTTPS for Tailscale Serve/MagicDNS in your tailnet and
restart:

```sh
dream remote stop
dream remote start
```

After HTTPS is active, open the Remote URL, tap `Install App`, and allow
notifications when the browser asks. Mobile browsers can cache home-screen and
quick-access icons aggressively; if an old icon remains, remove the old shortcut
or installed app and add it again.

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
git tag v0.1.40
git push origin v0.1.40
```

The release workflow runs `npm ci`, `npm run check`, `npm pack`, uploads
`dream-code-*.tgz`, and writes `SHA256SUMS`.

Useful installer overrides:

```sh
DREAM_CODE_VERSION=v0.1.40 sh install.sh
DREAM_CODE_SOURCE=1 sh install.sh
```

## Core Features

- **Dream Remote:** self-hosted web/PWA remote control over Tailscale, with
  project/session navigation, live command output, `/swarm`, uploads, browser
  notifications, PWA install support, and daemonized background operation.
- **Fast TUI:** slash commands, slash skill autocomplete, `@` file mentions,
  history, menus, smooth streaming, and Esc double-tap interrupt.
- **Running input dock:** keep typing while an agent is working. Plain text is
  queued for the next turn, while `/steer` can redirect the active run at the
  next safe model boundary.
- **Autonomous by default:** Dream Code favors completion over clarification,
  uses research when a concept is unclear, and verifies before reporting
  success.
- **Termux-first:** built for Android Termux, with macOS, Linux, and Windows CLI
  support.
- **Self-update:** run `dream update` to move to the latest GitHub Release, or
  `dream update --check` to only check availability.
- **Auto model routing:** use one provider by default, or switch on `/auto` to
  route each prompt, agent, and swarm lane across connected providers with
  fallback chains. Connect at least one provider with `/login` before enabling
  it.
- **Provider cost control:** disable expensive env-detected providers with
  `/provider disable <provider>` and re-enable them when needed.
- **Drive mode:** use `/drive <objective> --check <command>` when you want Dream
  Code to keep editing and re-running a real verifier until the repo proves the
  work is done.
- **Goal mode:** use `/goal <objective>` for sustained coding work. Dream Code
  saves the active goal, turns it into success criteria and next actions, and
  keeps checking whether later turns actually satisfied it.
- **Agents and swarm:** open the `/agents` board to inspect, peek, reply to, and
  stop subagent sessions, or run Dream Swarm for parallel analysis and review.
  Use `/swarm --deep` for adaptive coverage, `/swarm --overdrive` for
  adversarial high-pressure review, or `/swarm --lanes N` when you want to force
  a specific number of review lanes.
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
  standard OS notification tools, with allowlisted argv command overrides.
- **Cron automation:** schedule recurring agent work from the TUI, run it from a
  background daemon, and let jobs call normal prompts, `/workflow`, `/loop`, or
  `/swarm`.
- **LoopSpec automation:** run guarded agent/evaluator loops with `/loop`, where
  a command evaluator decides whether each turn passed before Dream Code
  continues. Use it for checks with real pass/fail signals, not vague taste
  work. Use `/goal` when the success criteria need agent judgment rather than a
  single command.
- **Workflow as code:** run project-local JavaScript workflows with `agent()`,
  `parallel()`, `pipeline()`, file helpers, globbing, traces, and starter
  templates.
- **Coding-agent evals:** run deterministic readiness checks with `dream eval`
  to verify permission guards, self-review discipline, loop retry context,
  OpenAI-compatible model parsing, and agent-run telemetry without calling a
  live LLM.
- **Project awareness:** load `AGENTS.md`, `DESIGN.md`, plans, tasks, sessions,
  LSP diagnostics, live MCP tools, hooks, and local tool health.
- **Workspace control:** let the agent list, search, grep with regex/globs,
  glob files with gitignore awareness, read line ranges, create directories,
  write files, edit files with replacement-count guards, delete files, run
  allowlisted argv commands, and research the web. Fresh installs start in ask
  mode; use `dream --yolo` for one-shot bypass or `/yolo` when you intentionally
  want persisted bypass. Existing
  files are checkpointed under `~/.dream/file-history/` before write/edit/delete
  tools mutate them.

## Providers

Dream Code is env-first. If an API key already exists, `/login` can use it
without asking again. Otherwise, connect from the TUI and credentials are saved
to `~/.dream/credentials.json`.

Supported provider targets:

```text
openai, deepseek, opencode-go, opencode-zen, minimax, kimi, z-ai, gemini,
xiaomi-mimo, openrouter, sakana, ollama, groq, xai, mistral, together,
fireworks, cerebras, qwen, custom-openai
```

OpenAI supports API key credentials and Codex/ChatGPT OAuth-style credentials.
For OpenAI-compatible endpoints, use `custom-openai` and pass the API root that
serves `/models` and `/chat/completions`; include `/v1` when your server expects
it:

```text
/login custom-openai http://127.0.0.1:4000/v1

CUSTOM_OPENAI_API_KEY=sk-...
DREAM_CUSTOM_OPENAI_BASE_URL=http://127.0.0.1:4000/v1
```

Dream Code fetches `GET {baseUrl}/models` after login and uses the discovered
model IDs as the default low/mid/high tiers.

For local Ollama, Dream Code uses the default OpenAI-compatible endpoint
`http://127.0.0.1:11434/v1` and does not require an API key:

```text
/login ollama

DREAM_OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
```

After login, Ollama model discovery reads the native `GET /api/tags` endpoint
behind the same local server and uses installed model names such as
`llama3.2:latest` or `qwen2.5-coder:7b`.

## Coding-Agent Quality

Use `dream eval` before large autonomous changes or releases. It returns a
deterministic score and repair hints for the core coding-agent contract:

```text
dream eval
dream eval --json
```

Agent runs also append structured JSONL telemetry under
`~/.dream/agent_run_telemetry.jsonl` with status, duration, tool calls, changed
file counts, and failed tool counts. Use it with `dream runs show latest --json`
and `~/.dream/model_telemetry.jsonl` when investigating routing, provider
health, or long-running task stability.

The eval includes a tiny reproduce-fix-verify fixture that exercises real
workspace edit tools and a command evaluator. It also inspects the current git
diff for broad or testless source changes; that check can warn without failing
the command, so reviewers see risk without blocking useful local iteration.

## Running Input, Queue, And Steering

Dream Code keeps the input dock available while an agent is running. The layout
is intentionally split into three stable regions: top session/status context, a
middle transcript/agent viewport, and the bottom input/status dock. Agent
responses, user prompts, swarm monitors, and progress animation stay in the
middle viewport; the input dock remains anchored at the bottom.

During a running turn, plain text plus `Enter` adds a queued follow-up for the
next turn:

```text
also check the release workflow
/q add a note about Termux install
/queue list
/queue edit 2 focus on mobile keyboard UX
/queue rm 2
/queue send 1
/queue send all
/queue clear
```

Use steering when the active agent is still thinking or streaming and you want
to redirect it sooner than the next queued turn:

```text
/steer stop summarizing and inspect the failing test first
/s ignore the broad audit and focus only on the cursor bug
```

Steering is injected as high-priority user guidance at the next safe model
boundary. If a model stream is active, Dream Code interrupts that stream and
starts the next model call with the steering message attached. This is not a
destructive terminal interrupt; use `Esc Esc` or `Ctrl+C` when you want to stop
the whole running agent instead.

## Drive Mode

`/drive` is the coding endgame mode: one objective, an optional real check
command, repeated agent turns, saved loop evidence, and goal completion only
after verification passes.

```text
/drive fix the failing provider tests --check npm test
/drive ship the remote notification polish --turns 6 --check npm run check
/drive harden the plugin installer before release
```

With `--check`, Drive Mode turns the objective into a temporary LoopSpec and
uses the same command-evaluator engine as `/loop`: run an agent turn, execute the
check, feed failures into the next turn, and stop when the command passes or the
turn budget is exhausted. The check command goes through Dream Code's shell
parser and executable allowlist, so `--check` does not become an unbounded shell.
Passing checks complete the active goal and save a loop run under
`~/.dream/loops/runs/`; failed or exhausted drives keep evidence on the goal for
the next turn.

Without `--check`, Drive Mode still starts a durable goal and asks the agent to
make concrete progress instead of stopping at analysis. Use this when the
strongest verifier needs human judgment, then follow with `/swarm --overdrive`
or a concrete `/loop` once a command can judge the result.

## Goal Mode

`/goal` is the right gear for real coding work: one objective, persistent
context, concrete next actions, and a skeptical judge that keeps the work from
ending at analysis.

```text
/goal fix the failing provider tests and verify the suite
/goal ship the remote notification polish
/goal
/goal done tests pass and the release note is updated
/goal clear
```

When you start a goal, Dream Code records it in `~/.dream/goal.json`, appends it
to the task/workflow notes, and starts an agent turn that asks for success
criteria, risks, task breakdown, and the next concrete action. After normal
agent turns, an independent goal judge reviews the latest transcript. If the
judge sees enough evidence, the goal is marked complete. If not, Dream Code can
add a synthetic continuation turn that says to keep going, take the next
concrete action, update evidence, and report what remains.

Use Goal mode when you want implementation, repair, refactoring, or verification
to keep moving. Use Dream Swarm before or after Goal mode when you want broad
review pressure instead of direct execution.

## Dream Swarm

Dream Swarm is the review and analysis gear. It fans a task out across multiple
specialized agents, shows a live monitor, then merges the lanes into one final
synthesis. It is best for architecture critique, release pressure tests,
security/permissions review, regression hunting, UX review, test strategy, and
finding risks before or after Goal mode does the implementation.

```text
/swarm analyze this project
/swarm --deep run a security review
/swarm --overdrive pressure-test the release
/swarm --lanes 10 run a broad compatibility audit
/swarm --lanes 25 --overdrive wake the whole dream
```

Without options, Dream Code uses a standard adaptive fan-out and picks
task-specific review lanes from the goal. Use `--light`, `--standard`, `--deep`,
or `--max` to increase coverage while still letting Dream choose the best lane
mix. Use `--overdrive` for a sharper 10-lane adversarial pass with failure,
security, regression, performance, integration, and final-judge lanes. Use
`--lanes N` only when you want exactly `N` lanes; combining it with `--overdrive`
is the hidden high-lane path for intentionally noisy stress runs. The older
`--size N` spelling still works as a deprecated alias for cron and existing
scripts.

A useful rhythm is:

```text
/swarm --deep analyze the design and risks for this change
/drive implement the selected approach --check npm test
/swarm --overdrive pressure-test the finished work before release
```

## LoopSpec

`/loop` turns a repeatable coding task into a small loop: Dream Code runs an
agent turn, executes a command evaluator, and keeps going until the evaluator
passes or the turn budget is exhausted. Run `/loop` with no arguments to create
`.dream/loops/example.json`, preview with `--dry-run`, then execute the saved
spec when the command looks right.

```text
/loop
/loop .dream/loops/example.json --dry-run
/loop .dream/loops/example.json
```

LoopSpec files are JSON and start with `version: 1`:

```json
{
  "version": 1,
  "name": "test-ratchet",
  "goal": "Make the project checks pass without weakening the checks.",
  "prompt": "Inspect the failing check, make the smallest fix, and leave a short verification note.",
  "maxTurns": 3,
  "evaluator": {
    "type": "command",
    "command": "npm",
    "args": ["test"],
    "passExitCodes": [0],
    "timeoutMs": 120000
  }
}
```

The command evaluator runs a real local process, so Dream Code asks for approval
outside YOLO mode and records loop runs under `~/.dream/loops/runs/`. Cron can
run LoopSpecs with a `/loop path/to/spec.json` job, but evaluator commands are
allowed only for jobs saved with YOLO permission.

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
/drive        Drive coding work to verified completion
/exit         Exit Dream Code
/export       Export the current conversation
/goal         Start or inspect goal mode
/hooks        Show hook settings and recent runs
/interview    Align on implementation direction
/login        Connect a provider
/logout       Forget provider credentials
/loop         Run a LoopSpec until checks pass
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
/runs         Inspect or revert agent runs
/session      Open saved sessions
/skills       Show and toggle installed skills
/status       Show goal, tasks, and model health
/swarm        Run parallel analysis and review lanes
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

While an agent is running, the bottom dock accepts the same editing keys. Plain
text plus `Enter` queues the next turn; `/steer ...` or `/s ...` steers the
active run; `/queue ...` or `/q ...` lists, edits, removes, sends, or clears
queued items.

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
- `dream update` and `dream update --check` for GitHub Release self-updates
- Dream Remote web app with Tailscale-only startup, localhost daemon binding,
  project/thread navigation, uploads, live run output, browser notifications,
  PWA icons, and stop/status commands
- `/rename` for current session naming
- Automatic and manual `/compact`
- Project/global rules loading from `AGENTS.md`, `CLAUDE.md`,
  `CLAUDE.local.md`, and `.claude/rules/*.md`
- Design-system context loading from `DESIGN.md`
- `/context`, `/clear`, and `/restore` session/context recovery commands
- Running input dock with follow-up queue and live steering commands
- Drive mode for check-backed coding work that reuses the LoopSpec evaluator
- Goal mode for sustained coding work with judge-style continuation support
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
- Dream Swarm review fan-out with live monitor
- Swarm synthesis artifacts and memory absorption
- Memory layers: project memory, checkpoint, task progress
- Hidden memory writer for compact/checkpoint updates
- Workflow-as-code JavaScript recipes with starter generation
- Daemon-backed cron jobs for recurring prompts, workflows, and swarms
- Agent tools for reading, listing, text search, regex grep, gitignore-aware
  glob, exact URL fetch, workspace stat, diff, diagnostics, mkdir, write,
  guarded edit, unified patch, move, copy, delete, MCP calls, artifacts, and
  task ledger updates
- File history checkpoints before write/edit/patch/move/copy/delete and
  `/restore <path>`; restore also checkpoints the current file first so a
  restore can be undone
- Web research through an allowlisted `DREAM_RESEARCH_COMMAND` argv command or
  built-in DuckDuckGo fallback
- TypeScript, Rust, Go, Python, and Java diagnostics through `/lsp`
- MCP stdio server discovery and `tools/list` / `tools/call` bridge
- Hook execution with recent run logs
- Local file read/write/edit helpers
- Shell command support with permission mode awareness, executable allowlisting,
  shell-metacharacter blocking, and destructive-pattern blocking
- Native OS notifications for long completions and permission-required states
- Ask mode by default, with `dream --yolo` or `/yolo` for explicit bypass control
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
~/.dream/webapp/remote.log       Dream Remote daemon log
~/.dream/webapp/remote-*.log.gz   compressed Dream Remote log archives
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
