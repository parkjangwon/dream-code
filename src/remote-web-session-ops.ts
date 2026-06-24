import {
  requestJson,
  type CommandRecord,
  type ProjectDto,
  type RemoteState,
  type SessionDetailDto,
  type SessionDto,
} from "./remote-web-api.js";
import type { RemoteNavigation } from "./remote-web-navigation.js";

type CommandResponse = {
  readonly command: CommandRecord;
};

export function openSession(
  token: string,
  project: ProjectDto,
  session: SessionDto,
  navigation: RemoteNavigation,
  setError: (message: string) => void,
): void {
  requestJson<{ readonly session: SessionDetailDto }>("GET", `/api/sessions/${encodeURIComponent(session.id)}`, undefined, token).then((result) => {
    navigation.navigate({ kind: "thread", project, session: result.session, commandIds: [] });
    setError("");
  }).catch((loadError: unknown) => {
    setError(loadError instanceof Error ? loadError.message : "Session failed to load.");
  });
}

export function openSessionById(
  token: string,
  sessionId: string,
  projects: readonly ProjectDto[],
  navigation: RemoteNavigation,
  setError: (message: string) => void,
): void {
  requestJson<{ readonly session: SessionDetailDto }>("GET", `/api/sessions/${encodeURIComponent(sessionId)}`, undefined, token).then((result) => {
    const project = projectForSession(projects, result.session);
    if (project === undefined) {
      setError("Session project is no longer available.");
      return;
    }
    navigation.navigate({ kind: "thread", project, session: result.session, commandIds: [] });
    window.history.replaceState(window.history.state, "", window.location.pathname);
    setError("");
  }).catch((loadError: unknown) => {
    setError(loadError instanceof Error ? loadError.message : "Session failed to load.");
  });
}

export function cancelCommand(token: string, id: string, setError: (message: string) => void): void {
  requestJson<CommandResponse>("POST", `/api/commands/${encodeURIComponent(id)}/cancel`, undefined, token).then(() => {
    setError("");
  }).catch((cancelError: unknown) => {
    setError(cancelError instanceof Error ? cancelError.message : "Command cancel failed.");
  });
}

export async function deleteRemoteSession(
  token: string,
  session: SessionDto,
  setState: (update: (current: RemoteState) => RemoteState) => void,
  setError: (message: string) => void,
): Promise<boolean> {
  try {
    await requestJson<{ readonly ok: true }>("DELETE", `/api/sessions/${encodeURIComponent(session.id)}`, undefined, token);
    setState((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== session.id) }));
    setError("");
    return true;
  } catch (deleteError: unknown) {
    setError(deleteError instanceof Error ? deleteError.message : "Session delete failed.");
    return false;
  }
}

export async function renameRemoteSession(
  token: string,
  session: SessionDto,
  name: string,
  setState: (update: (current: RemoteState) => RemoteState) => void,
  setError: (message: string) => void,
): Promise<SessionDetailDto | undefined> {
  try {
    const result = await requestJson<{ readonly session: SessionDetailDto }>("PATCH", `/api/sessions/${encodeURIComponent(session.id)}`, { name }, token);
    setState((current) => ({
      ...current,
      sessions: current.sessions.map((item) => item.id === result.session.id ? result.session : item),
    }));
    setError("");
    return result.session;
  } catch (renameError: unknown) {
    setError(renameError instanceof Error ? renameError.message : "Session rename failed.");
    return undefined;
  }
}

export function projectForSession(projects: readonly ProjectDto[], session: SessionDto): ProjectDto | undefined {
  if (session.directory === undefined) {
    return undefined;
  }
  return projects.find((project) => project.path === session.directory) ?? projectFromPath(session.directory);
}

function projectFromPath(path: string): ProjectDto {
  const parts = path.split(/[\\/]/u).filter((part) => part.length > 0);
  return { id: path, name: parts.at(-1) ?? path, path };
}
