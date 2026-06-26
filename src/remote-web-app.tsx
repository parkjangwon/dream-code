import { h, render } from "preact";
import { useEffect, useState } from "preact/hooks";

import { Composer } from "./remote-web-composer.js";
import { LogoutDialog, SessionDeleteDialog } from "./remote-web-confirm.js";
import { RenameSessionDialog, ThreadActions } from "./remote-web-session-actions.js";
import { useNotificationNavigation } from "./remote-web-notification-navigation.js";
import { registerRemoteServiceWorker } from "./remote-web-notifications.js";
import { useRemoteAuth } from "./remote-web-auth.js";
import { useRemoteNavigation } from "./remote-web-navigation.js";
import { useCommandStream, useRemoteData, useRemoteWorkspaceRefresh } from "./remote-web-data.js";
import { pairedStorageKey, remoteLabels as t } from "./remote-web-labels.js";
import {
  deleteRemoteSession,
  renameRemoteSession,
} from "./remote-web-session-ops.js";
import { commandsForThread, renderAuthScreen } from "./remote-web-shell.js";
import {
  type CommandRecord,
  type RemoteState,
  type SessionDetailDto,
  type SessionDto,
} from "./remote-web-api.js";

function App() {
  const auth = useRemoteAuth(pairedStorageKey);
  const authReady = auth.state.kind === "paired";
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
  const rememberCommand = (command: CommandRecord) => {
    navigation.replace((current) => current.kind === "thread" ? { ...current, commandIds: [...current.commandIds, command.id] } : current);
  };

  useEffect(() => registerRemoteServiceWorker(), []);
  useRemoteData(authReady, setState, setCommands, setError);
  useRemoteWorkspaceRefresh(authReady, setState, setError);
  useCommandStream(authReady, setCommands, setState, setError);
  useNotificationNavigation(authReady, state.projects, navigation, setError);

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
          {renderAuthScreen({
            auth,
            navigation,
            state,
            visibleCommands,
            setState,
            setDeleteTarget,
            setLogoutOpen,
            setMessage,
            setError,
            onCommand: rememberCommand,
          })}
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
            deleteRemoteSession(deleteTarget, setState, setError).then((deleted) => {
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
            renameRemoteSession(renameTarget, name, setState, setError).then((renamed) => {
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
      {authReady && screen.kind === "thread" ? (
        <Composer
          message={message}
          screen={screen}
          onMessage={setMessage}
          onCommand={rememberCommand}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

render(<App />, document.querySelector("#app") ?? document.body);
