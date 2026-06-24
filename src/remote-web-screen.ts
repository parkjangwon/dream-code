import type { ProjectDto, SessionDetailDto } from "./remote-web-api.js";

export type RemoteScreen =
  | { readonly kind: "home" }
  | { readonly kind: "project"; readonly project: ProjectDto }
  | {
    readonly kind: "thread";
    readonly project: ProjectDto | undefined;
    readonly session: SessionDetailDto | undefined;
    readonly commandIds: readonly string[];
  };

export const homeScreen: RemoteScreen = { kind: "home" };

export function screenFromHistoryState(value: unknown): RemoteScreen {
  if (!isRecord(value) || value["dreamRemote"] !== true) {
    return homeScreen;
  }
  return screenFromUnknown(value["screen"]) ?? homeScreen;
}

export function historyStateForScreen(screen: RemoteScreen): { readonly dreamRemote: true; readonly screen: RemoteScreen } {
  return { dreamRemote: true, screen };
}

export function routeForScreen(screen: RemoteScreen): string {
  switch (screen.kind) {
    case "home":
      return "#/";
    case "project":
      return `#/projects/${encodeURIComponent(screen.project.id)}`;
    case "thread":
      return `#/thread/${encodeURIComponent(screen.project?.id ?? "default")}`;
    default:
      return assertNever(screen);
  }
}

function screenFromUnknown(value: unknown): RemoteScreen | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  switch (value["kind"]) {
    case "home":
      return homeScreen;
    case "project":
      return isProject(value["project"]) ? { kind: "project", project: value["project"] } : undefined;
    case "thread":
      return {
        kind: "thread",
        project: isProject(value["project"]) ? value["project"] : undefined,
        session: isSessionDetail(value["session"]) ? value["session"] : undefined,
        commandIds: stringArray(value["commandIds"]),
      };
    default:
      return undefined;
  }
}

function isProject(value: unknown): value is ProjectDto {
  return isRecord(value)
    && typeof value["id"] === "string"
    && typeof value["name"] === "string"
    && typeof value["path"] === "string";
}

function isSessionDetail(value: unknown): value is SessionDetailDto {
  return isRecord(value)
    && typeof value["id"] === "string"
    && typeof value["directory"] === "string"
    && Array.isArray(value["turns"]);
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected remote screen: ${String(value)}`);
}
