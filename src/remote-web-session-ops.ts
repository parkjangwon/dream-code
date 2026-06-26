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
  project: ProjectDto,
  session: SessionDto,
  navigation: RemoteNavigation,
  setError: (message: string) => void,
): void {
  requestJson<{ readonly session: SessionDetailDto }>("GET", `/api/sessions/${encodeURIComponent(session.id)}`).then((result) => {
    navigation.navigate({ kind: "thread", project, session: result.session, commandIds: [] });
    setError("");
  }).catch((loadError: unknown) => {
    setError(loadError instanceof Error ? loadError.message : "Session failed to load.");
  });
}

export function openSessionById(
  sessionId: string,
  projects: readonly ProjectDto[],
  navigation: RemoteNavigation,
  setError: (message: string) => void,
): void {
  requestJson<{ readonly session: SessionDetailDto }>("GET", `/api/sessions/${encodeURIComponent(sessionId)}`).then((result) => {
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

export function cancelCommand(id: string, setError: (message: string) => void): void {
  requestJson<CommandResponse>("POST", `/api/commands/${encodeURIComponent(id)}/cancel`).then(() => {
    setError("");
  }).catch((cancelError: unknown) => {
    setError(cancelError instanceof Error ? cancelError.message : "Command cancel failed.");
  });
}

export function retryCommand(
  command: CommandRecord,
  onCommand: (command: CommandRecord) => void,
  setError: (message: string) => void,
): void {
  requestJson<CommandResponse>("POST", "/api/commands", retryCommandBody(command)).then((result) => {
    onCommand(result.command);
    setError("");
  }).catch((retryError: unknown) => {
    setError(retryError instanceof Error ? retryError.message : "Command retry failed.");
  });
}

export async function deleteRemoteSession(
  session: SessionDto,
  setState: (update: (current: RemoteState) => RemoteState) => void,
  setError: (message: string) => void,
): Promise<boolean> {
  try {
    await requestJson<{ readonly ok: true }>("DELETE", `/api/sessions/${encodeURIComponent(session.id)}`);
    setState((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== session.id) }));
    setError("");
    return true;
  } catch (deleteError: unknown) {
    setError(deleteError instanceof Error ? deleteError.message : "Session delete failed.");
    return false;
  }
}

export async function renameRemoteSession(
  session: SessionDto,
  name: string,
  setState: (update: (current: RemoteState) => RemoteState) => void,
  setError: (message: string) => void,
): Promise<SessionDetailDto | undefined> {
  try {
    const result = await requestJson<{ readonly session: SessionDetailDto }>("PATCH", `/api/sessions/${encodeURIComponent(session.id)}`, { name });
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

function retryCommandBody(command: CommandRecord): { readonly prompt: string; readonly cwd: string; readonly sessionId?: string } {
  return {
    prompt: command.prompt,
    cwd: command.cwd,
    ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId }),
  };
}
