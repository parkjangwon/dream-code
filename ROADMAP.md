# Dream Code Roadmap

**Signature:** 잠든 사이에도, 당신의 꿈은 빌드됩니다.

Dream Code is a Termux-first coding harness CLI: small core, fast feel, portable
runtime, and durable execution for goals that should keep moving while the user
rests.

## Product Principles

- **Termux first:** Node.js runtime, no required native npm dependencies, graceful
  fallback when local tools are missing.
- **Minimal core:** ship only the harness primitives by default; grow through
  capabilities later.
- **Durable autonomy:** goal, plan, task, swarm, and team workflows always leave
  state and evidence behind.
- **Token thrift:** retrieve precise context, compress tool output, cache stable
  prompts, and route cheap work to cheap models.
- **Plain power:** YOLO means full permission bypass. The UI must make that state
  obvious.
- **English runtime UI:** TUI and CLI-facing runtime strings stay English-only.

## MVP Scope

1. **CLI/TUI shell**
   - `dream` opens a simple Antigravity-style TUI.
   - `dream --yolo` enables one-shot bypass for the current process.
   - `/help`, `/status`, `/doctor`, `/yolo`, `/model`, and `/quit`.
   - Basic `/read`, `/write`, `/edit`, and `/shell` commands.
   - Ctrl+L redraw, Up/Down history, and slash command menu.

2. **Config**
   - Store main config at `~/.dream/config.toml`, model routing at `~/.dream/models.toml`, and agents as Markdown cards under `~/.dream/agents/` or `.dream/agents/`.
   - Keep provider credentials in `~/.dream/credentials.json` as an app-owned secret store with owner-only permissions.
   - Persist `/yolo` toggles.
   - Keep a single default visual theme; do not expose theme settings.

3. **Model Modes**
   - Single provider mode with `low`, `mid`, and `high` tiers.
   - Multi model auto mode with category routing, provider candidate chains, and
     dry-run route previews.
   - Provider registry, env-first connect flow, saved credentials, and live
     OpenAI-compatible streaming calls.

4. **Environment Doctor**
   - Detect `node`, `npm`, `git`, `rg`, `fd`, `jq`, `python3`, and LSP candidates.
   - Explain which fallbacks Dream Code will use.

5. **Workflow Vocabulary**
   - Implemented commands for interview, plan, goal, tasks, sessions, research,
     LSP, rules, compact context, artifacts, add-dir, copy/export, hooks, MCP,
     agents, and swarm.
   - Agent profiles live as Markdown under `~/.dream/agents/` and
     `.dream/agents/`; no separate crew/team TOML is required.

## Near-Term Milestones

### M1: Runnable Harness

- TUI shell.
- Config load/save.
- YOLO semantics.
- Doctor checks.
- Roadmap and README.

### M2: Local Coding Tools

- Harden `read`, `write`, `edit`, and `shell` tools.
- `rg`-first file search with fallback.
- Tool output compression policy.
- Kimi-inspired session storage: `session_index.jsonl`, per-session `state.json`, and append-only `wire.jsonl`.

### M3: Model Layer

- Expand provider registry coverage.
- Single provider tier routing.
- Multi provider route table with category chains inspired by Pi Pizza and
  capability/fallback ideas from Oh My OpenAgent.
- Connected-provider aware auto selection and `/model route <prompt>` previews.
- Cost/latency/health telemetry.
- OAuth polish for providers that expose CLI/browser auth flows.

### M4: Workflow Engine

- Interview brief.
- Plan artifact and task ledger.
- Durable goal state.
- Automatic and manual compact context.
- Rules and design-doc loading from global and project `AGENTS.md` and
  `DESIGN.md`.

### M5: Parallel Work

- Kimi-inspired Dream Swarm fan-out with forced lane count, live monitor,
  lane inspection, cancellation, and synthesis.
- Claude-style agent library and project/personal agent Markdown profiles.
- Remaining depth: rate-limit aware scheduling and resumable long-running
  swarm jobs.

### M6: Research And Code Intelligence

- Web research command and agent tool.
- LSP diagnostics command.
- MCP and hook configuration surfaces.
- Remaining depth: richer source citations, interactive LSP navigation, and
  evidence ledger integration.

## Deferred

- Theme marketplace and theme settings.
- Mascot dot editor.
- Native acceleration.
- Standalone platform binaries.
- Browser automation.
