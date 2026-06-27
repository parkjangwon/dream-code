import { useEffect, useRef } from "preact/hooks";

import { notifyCommandCompletion } from "./remote-web-notifications.js";
import {
  connectCommandEvents,
  requestJson,
  type CommandRecord,
  type RemoteModelDto,
  type ProjectDto,
  type RemoteState,
  type RunDto,
  type SessionDto,
} from "./remote-web-api.js";

export function useRemoteData(
  authReady: boolean,
  setState: (state: RemoteState) => void,
  setCommands: (commands: readonly CommandRecord[]) => void,
  setError: (message: string) => void,
): void {
  useEffect(() => {
    if (!authReady) {
      return;
    }
    let active = true;
    Promise.all([
      loadRemoteState(),
      requestJson<{ readonly commands: readonly CommandRecord[] }>("GET", "/api/commands"),
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
  }, [authReady, setState, setCommands, setError]);
}

export function useRemoteWorkspaceRefresh(
  authReady: boolean,
  setState: (update: (current: RemoteState) => RemoteState) => void,
  setError: (message: string) => void,
): void {
  useEffect(() => {
    if (!authReady) {
      return;
    }
    const refresh = (): void => {
      void refreshWorkspaceState(setState, setError);
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
  }, [authReady, setState, setError]);
}

export function useCommandStream(
  authReady: boolean,
  setCommands: (update: (current: readonly CommandRecord[]) => readonly CommandRecord[]) => void,
  setState: (update: (current: RemoteState) => RemoteState) => void,
  setError: (message: string) => void,
): void {
  const notifiedCommandIds = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!authReady) {
      return;
    }
    return connectCommandEvents((snapshot) => setCommands(() => snapshot), (command) => {
      let shouldRefresh = command.sessionId !== undefined && command.status !== "queued";
      setCommands((current) => {
        const previous = current.find((entry) => entry.id === command.id);
        shouldRefresh = shouldRefresh && previous?.sessionId !== command.sessionId;
        return [command, ...current.filter((entry) => entry.id !== command.id)];
      });
      if (shouldRefresh || command.status === "done" || command.status === "failed" || command.status === "cancelled") {
        void refreshWorkspaceState(setState, setError);
      }
      if (isCompleted(command) && !notifiedCommandIds.current.has(command.id)) {
        notifyCommandCompletion(command);
        notifiedCommandIds.current = new Set([...notifiedCommandIds.current, command.id]);
      }
    }, setError);
  }, [authReady, setCommands, setState, setError]);
}

async function refreshWorkspaceState(
  setState: (update: (current: RemoteState) => RemoteState) => void,
  setError: (message: string) => void,
): Promise<void> {
  try {
    const next = await loadRemoteState();
    setState(() => next);
    setError("");
  } catch (refreshError: unknown) {
    setError(refreshError instanceof Error ? refreshError.message : "Remote project refresh failed.");
  }
}

async function loadRemoteState(): Promise<RemoteState> {
  const [projects, sessions, runs, model] = await Promise.all([
    requestJson<{ readonly projects: readonly ProjectDto[] }>("GET", "/api/projects"),
    requestJson<{ readonly sessions: readonly SessionDto[] }>("GET", "/api/sessions"),
    requestJson<{ readonly runs: readonly RunDto[] }>("GET", "/api/runs"),
    requestJson<RemoteModelDto>("GET", "/api/model"),
  ]);
  return { projects: projects.projects, sessions: sessions.sessions, runs: runs.runs, model };
}

function isCompleted(command: CommandRecord): boolean {
  return command.status === "done" || command.status === "failed" || command.status === "cancelled";
}
