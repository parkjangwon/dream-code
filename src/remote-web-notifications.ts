import type { CommandRecord, CommandStatus } from "./remote-web-api.js";

const completionStatuses: readonly CommandStatus[] = ["done", "failed", "cancelled"];

export function registerRemoteServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  void navigator.serviceWorker.register("/sw.js").then((registration) => registration.update());
}

export function requestRemoteNotificationPermission(): void {
  if (!("Notification" in window) || Notification.permission !== "default") {
    return;
  }
  void Notification.requestPermission();
}

export function notifyCommandCompletion(command: CommandRecord): void {
  if (!completionStatuses.includes(command.status) || !canNotify()) {
    return;
  }
  const title = titleForCommand(command);
  const options: NotificationOptions = {
    body: command.prompt,
    data: command.sessionId === undefined ? { commandId: command.id } : { commandId: command.id, sessionId: command.sessionId },
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: `dream-remote-${command.id}`,
  };
  void showNotification(title, options).catch((error: unknown) => {
    if (error instanceof Error && "Notification" in window) {
      new Notification(title, options);
    }
  });
}

async function showNotification(title: string, options: NotificationOptions): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
    return;
  }
  new Notification(title, options);
}

function canNotify(): boolean {
  return "Notification" in window && Notification.permission === "granted";
}

function titleForCommand(command: CommandRecord): string {
  switch (command.status) {
    case "done":
      return "Dream Code finished";
    case "failed":
      return "Dream Code failed";
    case "cancelled":
      return "Dream Code cancelled";
    case "queued":
    case "running":
      return "Dream Code is working";
    default:
      return assertNever(command.status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled notification status: ${value}`);
}
