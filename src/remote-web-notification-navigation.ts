import { useEffect, useRef } from "preact/hooks";

import type { ProjectDto } from "./remote-web-api.js";
import type { RemoteNavigation } from "./remote-web-navigation.js";
import { openSessionById } from "./remote-web-session-ops.js";

type NotificationClickMessage = {
  readonly type: "dream-notification-click";
  readonly sessionId?: string;
};

export function useNotificationNavigation(
  token: string,
  projects: readonly ProjectDto[],
  navigation: RemoteNavigation,
  setError: (message: string) => void,
): void {
  const scrollTargetSessionId = useRef(readSessionIdFromLocation());
  useEffect(() => {
    if (token.length === 0) {
      return;
    }
    const openTarget = (sessionId: string | undefined): void => {
      if (sessionId !== undefined && sessionId.length > 0) {
        openSessionById(token, sessionId, projects, navigation, setError);
      }
    };
    openTarget(scrollTargetSessionId.current);
    scrollTargetSessionId.current = undefined;
    const onMessage = (event: MessageEvent): void => {
      if (isNotificationClickMessage(event.data)) {
        openTarget(event.data.sessionId);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [token, projects, navigation, setError]);
}

function readSessionIdFromLocation(): string | undefined {
  const sessionId = new URLSearchParams(window.location.search).get("session");
  return sessionId ?? undefined;
}

function isNotificationClickMessage(value: unknown): value is NotificationClickMessage {
  return isRecord(value)
    && value["type"] === "dream-notification-click"
    && (value["sessionId"] === undefined || typeof value["sessionId"] === "string");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
