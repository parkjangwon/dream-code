import { h } from "preact";

import { HomeView, ProjectView } from "./remote-web-home.js";
import { InstallAppButton } from "./remote-web-install.js";
import { ModelControl } from "./remote-web-model-control.js";
import { PairPanel } from "./remote-web-pair.js";
import { RunReviewSection } from "./remote-web-run-review.js";
import { CommandThread } from "./remote-web-thread.js";
import { useRemoteAuth } from "./remote-web-auth.js";
import type { RemoteNavigation } from "./remote-web-navigation.js";
import type { RemoteScreen } from "./remote-web-screen.js";
import { remoteLabels } from "./remote-web-labels.js";
import {
  cancelCommand,
  openSession,
  projectForSession,
  retryCommand,
} from "./remote-web-session-ops.js";
import { approveRemoteCommand, rejectRemoteCommand, stateWithModel } from "./remote-web-run-ops.js";
import type {
  CommandRecord,
  RemoteState,
  SessionDto,
} from "./remote-web-api.js";

export function renderAuthScreen(props: {
  readonly auth: ReturnType<typeof useRemoteAuth>;
  readonly navigation: RemoteNavigation;
  readonly state: RemoteState;
  readonly visibleCommands: readonly CommandRecord[];
  readonly setState: (update: (current: RemoteState) => RemoteState) => void;
  readonly setDeleteTarget: (session: SessionDto) => void;
  readonly setLogoutOpen: (open: boolean) => void;
  readonly setMessage: (message: string) => void;
  readonly setError: (message: string) => void;
  readonly onCommand: (command: CommandRecord) => void;
}) {
  switch (props.auth.state.kind) {
    case "checking":
      return <p class="muted loading-text">{remoteLabels.checkingConnection}</p>;
    case "pairing":
      return <PairPanel labels={remoteLabels} onPaired={props.auth.pair} />;
    case "paired":
      return (
        <div class="paired-shell">
          <div class="connection">
            <span><span class="status-dot" />{remoteLabels.paired} · {props.auth.state.device.name}</span>
            <span class="connection-actions">
              <InstallAppButton />
              <button type="button" onClick={() => props.setLogoutOpen(true)}>{remoteLabels.logoutDevice}</button>
            </span>
          </div>
          {renderScreen(props)}
        </div>
      );
    default:
      return assertNever(props.auth.state);
  }
}

export function commandsForThread(screen: Extract<RemoteScreen, { readonly kind: "thread" }>, commands: readonly CommandRecord[]): readonly CommandRecord[] {
  if (screen.session !== undefined) {
    return commands.filter((command) => screen.commandIds.includes(command.id) || (command.sessionId === screen.session?.id && isActive(command)));
  }
  return commands.filter((command) => screen.commandIds.includes(command.id));
}

function renderScreen(props: {
  readonly navigation: RemoteNavigation;
  readonly state: RemoteState;
  readonly visibleCommands: readonly CommandRecord[];
  readonly setState: (update: (current: RemoteState) => RemoteState) => void;
  readonly setDeleteTarget: (session: SessionDto) => void;
  readonly setMessage: (message: string) => void;
  readonly setError: (message: string) => void;
  readonly onCommand: (command: CommandRecord) => void;
}) {
  const screen = props.navigation.screen;
  switch (screen.kind) {
    case "home":
      return (
        <div class="home-dashboard">
          <ModelControl
            model={props.state.model}
            onSaved={(model) => props.setState((current) => stateWithModel(current, model))}
            onError={props.setError}
          />
          <RunReviewSection runs={props.state.runs} onCommand={props.onCommand} onError={props.setError} />
          <HomeView
            projects={props.state.projects}
            recentSessions={props.state.sessions.slice(0, 12)}
            labels={remoteLabels}
            onOpenProject={(project) => props.navigation.navigate({ kind: "project", project })}
            onOpenSession={(session) => {
              const project = projectForSession(props.state.projects, session);
              if (project !== undefined) {
                openSession(project, session, props.navigation, props.setError);
              }
            }}
          />
        </div>
      );
    case "project":
      return (
        <ProjectView
          project={screen.project}
          sessions={props.state.sessions}
          labels={remoteLabels}
          onDeleteSession={props.setDeleteTarget}
          onNewThread={() => props.navigation.navigate({ kind: "thread", project: screen.project, session: undefined, commandIds: [] })}
          onOpenSession={(session) => openSession(screen.project, session, props.navigation, props.setError)}
        />
      );
    case "thread":
      return (
        <CommandThread
          turns={screen.session?.turns ?? []}
          commands={props.visibleCommands}
          onApprove={(id) => approveRemoteCommand(id).then(props.onCommand).catch((error: unknown) => props.setError(error instanceof Error ? error.message : "Approval failed."))}
          onCancel={(id) => cancelCommand(id, props.setError)}
          onReject={(id) => rejectRemoteCommand(id).then(props.onCommand).catch((error: unknown) => props.setError(error instanceof Error ? error.message : "Rejection failed."))}
          onRetry={(command) => retryCommand(command, props.onCommand, props.setError)}
        />
      );
    default:
      return assertNever(screen);
  }
}

function isActive(command: CommandRecord): boolean {
  return command.status === "queued" || command.status === "running" || command.status === "waiting_approval";
}

function assertNever(value: never): never {
  throw new Error(`Unexpected remote screen: ${String(value)}`);
}
