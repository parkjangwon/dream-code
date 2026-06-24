import { h, render } from "preact";
import { useEffect, useState } from "preact/hooks";

import { Composer } from "./remote-web-composer.js";
import { LogoutDialog, SessionDeleteDialog } from "./remote-web-confirm.js";
import { HomeView, ProjectView } from "./remote-web-home.js";
import { InstallAppButton } from "./remote-web-install.js";
import { PairPanel } from "./remote-web-pair.js";
import { CommandThread } from "./remote-web-thread.js";
import { RenameSessionDialog, ThreadActions } from "./remote-web-session-actions.js";
import { useNotificationNavigation } from "./remote-web-notification-navigation.js";
import { registerRemoteServiceWorker } from "./remote-web-notifications.js";
import { useRemoteAuth } from "./remote-web-auth.js";
import { useRemoteNavigation, type RemoteNavigation } from "./remote-web-navigation.js";
import type { RemoteScreen } from "./remote-web-screen.js";
import { useCommandStream, useRemoteData, useRemoteWorkspaceRefresh } from "./remote-web-data.js";
import {
  cancelCommand,
  deleteRemoteSession,
  openSession,
  projectForSession,
  renameRemoteSession,
} from "./remote-web-session-ops.js";
import {
  type CommandRecord,
  type RemoteState,
  type SessionDetailDto,
  type SessionDto,
} from "./remote-web-api.js";

const strings = {
  en: {
    askDreamCode: "Ask Dream Code",
    back: "Back",
    checkingConnection: "Checking connection...",
    connect: "Connect",
    deleteSession: "Delete",
    deviceName: "Device name",
    logoutDevice: "Logout",
    newThread: "New Thread",
    noProjects: "No projects yet.",
    noRecentThreads: "No recent threads yet.",
    noSessions: "No sessions yet.",
    paired: "Paired",
    pairDevice: "Pair this device",
    pairingCode: "Pairing code",
    projects: "Projects",
    recentThreads: "Recent Threads",
    remote: "Dream Code Remote",
    threads: "Threads",
    thread: "Thread",
  },
} as const;

const t = strings.en;
const tokenKey = "dream.remote.token";

function App() {
  const auth = useRemoteAuth(tokenKey);
  const token = auth.state.kind === "paired" ? auth.state.token : "";
  const [state, setState] = useState<RemoteState>({ projects: [], sessions: [] });
  const [commands, setCommands] = useState<readonly CommandRecord[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<SessionDto | undefined>(undefined);
  const [deletingSessionId, setDeletingSessionId] = useState<string | undefined>(undefined);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SessionDetailDto | undefined>(undefined);
  const [renamingSessionId, setRenamingSessionId] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const navigation = useRemoteNavigation();
  const screen = navigation.screen;

  useEffect(() => registerRemoteServiceWorker(), []);
  useRemoteData(token, setState, setCommands, setError);
  useRemoteWorkspaceRefresh(token, setState, setError);
  useCommandStream(token, setCommands, setState, setError);
  useNotificationNavigation(token, state.projects, navigation, setError);

  const visibleCommands = screen.kind === "thread" ? commandsForThread(screen, commands) : [];
  const title = screen.kind === "home" ? t.remote : screen.kind === "project" ? screen.project.name : screen.session?.name ?? screen.session?.summary ?? t.thread;

  return (
    <div>
      <main class="shell">
        <header class="top">
          {screen.kind === "home"
            ? <span class="top-spacer" aria-hidden="true" />
            : <button class="back" type="button" aria-label={t.back} onClick={navigation.goBack}>‹</button>}
          <h1 class="page-title">{title}</h1>
          {screen.kind === "thread" && screen.session !== undefined
            ? <ThreadActions onRename={() => setRenameTarget(screen.session)} />
            : <span class="top-spacer" aria-hidden="true" />}
        </header>
        <div class={`content page-transition page-${navigation.direction}`} key={screen.kind === "home" ? "home" : screen.kind === "project" ? `project-${screen.project.id}` : `thread-${screen.session?.id ?? screen.project?.id ?? "new"}`}>
          {renderAuthScreen(auth, navigation, token, state, visibleCommands, setState, setDeleteTarget, setLogoutOpen, setMessage, setError)}
        </div>
        {error.length > 0 ? <p class="muted">{error}</p> : null}
      </main>
      {deleteTarget === undefined ? null : (
        <SessionDeleteDialog
          busy={deletingSessionId === deleteTarget.id}
          session={deleteTarget}
          onCancel={() => {
            if (deletingSessionId === undefined) {
              setDeleteTarget(undefined);
            }
          }}
          onConfirm={() => {
            setDeletingSessionId(deleteTarget.id);
            deleteRemoteSession(token, deleteTarget, setState, setError).then((deleted) => {
              if (deleted) {
                setDeleteTarget(undefined);
              }
            }).finally(() => setDeletingSessionId(undefined));
          }}
        />
      )}
      {renameTarget === undefined ? null : (
        <RenameSessionDialog
          busy={renamingSessionId === renameTarget.id}
          session={renameTarget}
          onCancel={() => {
            if (renamingSessionId === undefined) {
              setRenameTarget(undefined);
            }
          }}
          onConfirm={(name) => {
            setRenamingSessionId(renameTarget.id);
            renameRemoteSession(token, renameTarget, name, setState, setError).then((renamed) => {
              if (renamed !== undefined) {
                navigation.replace((current) => current.kind === "thread" ? { ...current, session: renamed } : current);
                setRenameTarget(undefined);
              }
            }).finally(() => setRenamingSessionId(undefined));
          }}
        />
      )}
      {logoutOpen ? (
        <LogoutDialog
          onCancel={() => setLogoutOpen(false)}
          onConfirm={() => {
            setLogoutOpen(false);
            auth.forget();
          }}
        />
      ) : null}
      {token.length > 0 && screen.kind === "thread" ? (
        <Composer
          message={message}
          screen={screen}
          token={token}
          onMessage={setMessage}
          onCommand={(command) => {
            navigation.replace((current) => current.kind === "thread" ? { ...current, commandIds: [...current.commandIds, command.id] } : current);
          }}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function renderAuthScreen(
  auth: ReturnType<typeof useRemoteAuth>,
  navigation: RemoteNavigation,
  token: string,
  state: RemoteState,
  visibleCommands: readonly CommandRecord[],
  setState: (update: (current: RemoteState) => RemoteState) => void,
  setDeleteTarget: (session: SessionDto) => void,
  setLogoutOpen: (open: boolean) => void,
  setMessage: (message: string) => void,
  setError: (message: string) => void,
) {
  switch (auth.state.kind) {
    case "checking":
      return <p class="muted loading-text">{t.checkingConnection}</p>;
    case "pairing":
      return <PairPanel tokenKey={tokenKey} labels={t} onPaired={auth.pair} />;
    case "paired":
      return (
        <div class="paired-shell">
          <div class="connection">
            <span><span class="status-dot" />{t.paired} · {auth.state.device.name}</span>
            <span class="connection-actions">
              <InstallAppButton />
              <button type="button" onClick={() => setLogoutOpen(true)}>{t.logoutDevice}</button>
            </span>
          </div>
          {renderScreen(navigation.screen, token, state, visibleCommands, navigation, setState, setDeleteTarget, setMessage, setError)}
        </div>
      );
    default:
      return assertNever(auth.state);
  }
}

function renderScreen(
  screen: RemoteScreen,
  token: string,
  state: RemoteState,
  visibleCommands: readonly CommandRecord[],
  navigation: RemoteNavigation,
  setState: (update: (current: RemoteState) => RemoteState) => void,
  setDeleteTarget: (session: SessionDto) => void,
  setMessage: (message: string) => void,
  setError: (message: string) => void,
) {
  switch (screen.kind) {
    case "home":
      return (
        <HomeView
          projects={state.projects}
          recentSessions={state.sessions.slice(0, 12)}
          labels={t}
          onOpenProject={(project) => navigation.navigate({ kind: "project", project })}
          onOpenSession={(session) => {
            const project = projectForSession(state.projects, session);
            if (project !== undefined) {
              openSession(token, project, session, navigation, setError);
            }
          }}
        />
      );
    case "project":
      return (
        <ProjectView
          project={screen.project}
          sessions={state.sessions}
          labels={t}
          onDeleteSession={setDeleteTarget}
          onNewThread={() => navigation.navigate({ kind: "thread", project: screen.project, session: undefined, commandIds: [] })}
          onOpenSession={(session) => openSession(token, screen.project, session, navigation, setError)}
        />
      );
    case "thread":
      return <CommandThread turns={screen.session?.turns ?? []} commands={visibleCommands} onCancel={(id) => cancelCommand(token, id, setError)} />;
    default:
      return assertNever(screen);
  }
}

function commandsForThread(screen: Extract<RemoteScreen, { readonly kind: "thread" }>, commands: readonly CommandRecord[]): readonly CommandRecord[] {
  if (screen.session !== undefined) {
    return commands.filter((command) => screen.commandIds.includes(command.id) || (command.sessionId === screen.session?.id && isActive(command)));
  }
  return commands.filter((command) => screen.commandIds.includes(command.id));
}

function isActive(command: CommandRecord): boolean {
  return command.status === "queued" || command.status === "running";
}

function assertNever(value: never): never {
  throw new Error(`Unexpected remote screen: ${String(value)}`);
}

render(<App />, document.querySelector("#app") ?? document.body);
