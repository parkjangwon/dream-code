import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";

import { ActivityTimeline, ProcessSummary } from "./remote-web-activity.js";
import { CommandOutcomeSummary } from "./remote-web-command-summary.js";
import { cleanRemoteCommandOutput } from "./remote-command-output.js";
import { MarkdownView } from "./remote-web-markdown.js";
import type { CommandRecord, CommandStatus, SessionTurnDto } from "./remote-web-api.js";

const statusLabel: Record<CommandStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting_approval: "Needs Approval",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function CommandThread(props: {
  readonly commands: readonly CommandRecord[];
  readonly turns: readonly SessionTurnDto[];
  readonly onApprove: (id: string) => void;
  readonly onCancel: (id: string) => void;
  readonly onReject: (id: string) => void;
  readonly onRetry: (command: CommandRecord) => void;
}) {
  const commands = [...props.commands].reverse();
  const empty = commands.length === 0 && props.turns.length === 0;
  const endRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  const scrollKey = `${props.turns.length}:${commands.map((command) => `${command.id}:${command.updatedAt}:${command.activity.length}:${command.output.length}`).join("|")}`;
  useEffect(() => {
    const behavior: ScrollBehavior = didInitialScroll.current ? "smooth" : "auto";
    didInitialScroll.current = true;
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        endRef.current?.scrollIntoView({ block: "end", behavior });
      });
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, [scrollKey]);
  return (
    <section class="thread">
      <h2 class="section-title">Thread</h2>
      {empty ? <p class="muted">Send a prompt to start coding remotely.</p> : null}
      <div class="messages">
        {props.turns.filter(isVisibleTurn).map((turn) => (
          <TurnBubble turn={turn} />
        ))}
        {commands.map((command) => (
          <article class={`exchange process-card ${command.status}`} key={command.id}>
            <div class="bubble user-bubble">
              <span class="bubble-label">You</span>
              <p>{command.prompt}</p>
            </div>
            <div class="bubble dream-bubble process-panel">
              <div class="bubble-head">
                <span class={`pill ${command.status}`}>{statusLabel[command.status]}</span>
                {isActive(command) ? (
                  <button class="stop-command" type="button" onClick={() => props.onCancel(command.id)}>Stop</button>
                ) : null}
              </div>
              <ProcessSummary command={command} />
              <PersistentProcessTimeline command={command} />
              <ApprovalPanel command={command} onApprove={props.onApprove} onReject={props.onReject} />
              <CommandOutcomeSummary command={command} onRetry={props.onRetry} />
              <FinalCommandResult command={command} />
            </div>
          </article>
        ))}
        <div class="thread-scroll-anchor" ref={endRef} aria-hidden="true" />
      </div>
    </section>
  );
}

function ApprovalPanel(props: {
  readonly command: CommandRecord;
  readonly onApprove: (id: string) => void;
  readonly onReject: (id: string) => void;
}) {
  const approval = props.command.pendingApproval;
  if (approval === undefined) {
    return null;
  }
  return (
    <div class="approval-panel">
      <div class="approval-head">
        <span class="pill waiting_approval">{approval.tool}</span>
        <strong>{approval.label}</strong>
      </div>
      <pre>{approval.preview}</pre>
      <div class="approval-actions">
        <button type="button" onClick={() => props.onReject(props.command.id)}>Reject</button>
        <button type="button" onClick={() => props.onApprove(props.command.id)}>Approve</button>
      </div>
    </div>
  );
}

function TurnBubble(props: { readonly turn: SessionTurnDto }) {
  const user = props.turn.role === "user";
  const content = user ? props.turn.content : cleanRemoteCommandOutput(props.turn.content);
  return (
    <article class="exchange">
      <div class={`bubble ${user ? "user-bubble" : "dream-bubble"}`}>
        <span class="bubble-label">{user ? "You" : "Dream"}</span>
        {user ? <p class="turn-text">{content}</p> : <MarkdownView markdown={content} />}
      </div>
    </article>
  );
}

function PersistentProcessTimeline(props: { readonly command: CommandRecord }) {
  const command = props.command;
  return <ActivityTimeline command={command} />;
}

function FinalCommandResult(props: { readonly command: CommandRecord }) {
  const command = props.command;
  if (isActive(command)) {
    return command.output.trim().length > 0 ? <LiveOutput command={command} /> : null;
  }
  if (command.status === "done") {
    return (
      <div class="final-result">
        <MarkdownView markdown={commandText(command)} />
      </div>
    );
  }
  return (
    <div class="final-result terminal">
      <pre>{commandText(command)}</pre>
    </div>
  );
}

function LiveOutput(props: { readonly command: CommandRecord }) {
  const output = cleanRemoteCommandOutput(props.command.output);
  const swarmFrame = props.command.prompt.startsWith("/swarm") ? latestSwarmFrame(output) : undefined;
  return (
    <div class={`live-output ${swarmFrame === undefined ? "" : "swarm-live"}`} aria-label="Live command output">
      <div class="live-output-head">
        <span class="thinking-bars compact" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span>Live output · {props.command.prompt.split(/\s/u)[0] ?? "command"}</span>
      </div>
      {swarmFrame === undefined ? <pre>{tailText(output.trimEnd(), 4_000)}</pre> : <SwarmFrame text={swarmFrame} />}
    </div>
  );
}

function SwarmFrame(props: { readonly text: string }) {
  return (
    <pre class="swarm-frame">
      {props.text.split(/\r?\n/u).map((line, index) => (
        <span class={swarmLineClass(line)} key={index}>{line.length === 0 ? " " : line}</span>
      ))}
    </pre>
  );
}

function commandText(command: CommandRecord): string {
  if (command.error !== undefined) {
    return command.error;
  }
  if (command.output.trim().length > 0) {
    return cleanRemoteCommandOutput(command.output).trimEnd();
  }
  switch (command.status) {
    case "queued":
      return "Waiting for Dream Code...";
    case "running":
      return "Dream Code is working...";
    case "waiting_approval":
      return "Waiting for remote approval...";
    case "done":
      return "Done.";
    case "failed":
      return "Command failed.";
    case "cancelled":
      return "Cancelled.";
    default:
      return assertNever(command.status);
  }
}

function isActive(command: CommandRecord): boolean {
  return command.status === "queued" || command.status === "running" || command.status === "waiting_approval";
}

function isVisibleTurn(turn: SessionTurnDto): boolean {
  return turn.role !== "assistant" || !isToolOnlyResponse(turn.content);
}

function tailText(text: string, limit: number): string {
  return text.length <= limit ? text : `...\n${text.slice(-limit)}`;
}

function latestSwarmFrame(output: string): string | undefined {
  const text = stripAnsi(output).replace(/\r/gu, "\n");
  const monitors = [...text.matchAll(/^.*Swarm Monitor.*$/gmu)];
  const latest = monitors.at(-1);
  if (latest?.index === undefined) {
    return undefined;
  }
  const frame = text.slice(latest.index).trimEnd();
  const footer = /^.*token mixing radar online.*$/mu.exec(frame);
  if (footer?.index === undefined) {
    return frame;
  }
  return frame.slice(0, footer.index + footer[0].length);
}

function swarmLineClass(line: string): string {
  if (/\bRUNNING\b/u.test(line)) {
    return "swarm-frame-line running";
  }
  if (/\bactivity\b/u.test(line) || /\bsynthesis\b/u.test(line)) {
    return "swarm-frame-line active";
  }
  if (/\bDONE\b/u.test(line)) {
    return "swarm-frame-line done";
  }
  return "swarm-frame-line";
}

function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "");
}

function isToolOnlyResponse(content: string): boolean {
  return content.replace(/```dream-tool\s+[\s\S]*?```/gu, "").trim().length === 0
    && /```dream-tool/u.test(content);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled command status: ${value}`);
}
