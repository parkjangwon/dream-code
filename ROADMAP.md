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
   - Store main config at `~/.dream/config.toml`, model routing at `~/.dream/models.toml`, and crew agents as Markdown cards under `~/.dream/agents/` or `.dream/agents/`.
   - Keep provider credentials in `~/.dream/credentials.json` as an app-owned secret store with owner-only permissions.
   - Persist `/yolo` toggles.
   - Keep a single default visual theme; do not expose theme settings.

3. **Model Modes**
   - Single provider mode with `low`, `mid`, and `high` tiers.
   - Multi model auto mode shape for route-based orchestration.
   - Provider registry, env-first connect flow, saved credentials, and live
     OpenAI-compatible streaming calls.

4. **Environment Doctor**
   - Detect `node`, `npm`, `git`, `rg`, `fd`, `jq`, `python3`, and LSP candidates.
   - Explain which fallbacks Dream Code will use.

5. **Workflow Vocabulary**
   - Stub commands and state vocabulary for interview, plan, goal, task, swarm,
     team, research, LSP, token saving, read, edit, write, and shell.

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
- Multi provider route table.
- Cost/latency/health telemetry.
- OAuth polish for providers that expose CLI/browser auth flows.

### M4: Workflow Engine

- Interview brief.
- Plan artifact.
- Goal state machine.
- Task ledger.

### M5: Parallel Work

- AgentSwarm-style `prompt_template + items`.
- Task scheduler with rate-limit backoff.
- Team member profiles and personas.

### M6: Research And Code Intelligence

- Web research with citations.
- LSP diagnostics, definition, references, symbols, hover.
- Evidence ledger integration.

## Deferred

- Theme marketplace and theme settings.
- Mascot dot editor.
- Native acceleration.
- Standalone platform binaries.
- Browser automation.
