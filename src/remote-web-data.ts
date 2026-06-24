import { useEffect, useRef } from "preact/hooks";

import { notifyCommandCompletion } from "./remote-web-notifications.js";
import {
  connectCommandEvents,
  requestJson,
  type CommandRecord,
  type ProjectDto,
  type RemoteState,
  type SessionDto,
} from "./remote-web-api.js";

export function useRemoteData(
  token: string,
  setState: (state: RemoteState) => void,
  setCommands: (commands: readonly CommandRecord[]) => void,
  setError: (message: string) => void,
): void {
  useEffect(() => {
    if (token.length === 0) {
      return;
    }
    let active = true;
    Promise.all([
      loadRemoteState(token),
      requestJson<{ readonly commands: readonly CommandRecord[] }>("GET", "/api/commands", undefined, token),
    ]).then(([remoteState, commandHistory]) => {
      if (active) {
        setState(remoteState);
        setCommands(commandHistory.commands);
        setError("");
      }
    }).catch((loadError: unknown) => {
      if (active) {
        setError(loadError instanceof Error ? loadError.message : "Remote data failed to load.");
      }
    });
    return () => {
      active = false;
    };
  }, [token, setState, setCommands, setError]);
}

export function useRemoteWorkspaceRefresh(
  token: string,
  setState: (update: (current: RemoteState) => RemoteState) => void,
  setError: (message: string) => void,
): void {
  useEffect(() => {
    if (token.length === 0) {
      return;
    }
    const refresh = (): void => {
      void refreshWorkspaceState(token, setState, setError);
    };
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    const interval = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [token, setState, setError]);
}

export function useCommandStream(
  token: string,
  setCommands: (update: (current: readonly CommandRecord[]) => readonly CommandRecord[]) => void,
  setState: (update: (current: RemoteState) => RemoteState) => void,
  setError: (message: string) => void,
): void {
  const notifiedCommandIds = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (token.length === 0) {
      return;
    }
    return connectCommandEvents(token, (snapshot) => setCommands(() => snapshot), (command) => {
      let shouldRefresh = command.sessionId !== undefined && command.status !== "queued";
      setCommands((current) => {
        const previous = current.find((entry) => entry.id === command.id);
        shouldRefresh = shouldRefresh && previous?.sessionId !== command.sessionId;
        return [command, ...current.filter((entry) => entry.id !== command.id)];
      });
      if (shouldRefresh || command.status === "done" || command.status === "failed" || command.status === "cancelled") {
        void refreshWorkspaceState(token, setState, setError);
      }
      if (isCompleted(command) && !notifiedCommandIds.current.has(command.id)) {
        notifyCommandCompletion(command);
        notifiedCommandIds.current = new Set([...notifiedCommandIds.current, command.id]);
      }
    }, setError);
  }, [token, setCommands, setState, setError]);
}

async function refreshWorkspaceState(
  token: string,
  setState: (update: (current: RemoteState) => RemoteState) => void,
  setError: (message: string) => void,
): Promise<void> {
  try {
    const next = await loadRemoteState(token);
    setState(() => next);
    setError("");
  } catch (refreshError: unknown) {
    setError(refreshError instanceof Error ? refreshError.message : "Remote project refresh failed.");
  }
}

async function loadRemoteState(token: string): Promise<RemoteState> {
  const [projects, sessions] = await Promise.all([
    requestJson<{ readonly projects: readonly ProjectDto[] }>("GET", "/api/projects", undefined, token),
    requestJson<{ readonly sessions: readonly SessionDto[] }>("GET", "/api/sessions", undefined, token),
  ]);
  return { projects: projects.projects, sessions: sessions.sessions };
}

function isCompleted(command: CommandRecord): boolean {
  return command.status === "done" || command.status === "failed" || command.status === "cancelled";
}
