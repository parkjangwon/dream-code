import { h } from "preact";
import { useEffect, useState } from "preact/hooks";

type BeforeInstallPromptEvent = Event & {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<unknown>;
};

export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | undefined>(undefined);
  const [installed, setInstalled] = useState(isStandaloneApp);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event): void => {
      if (!isBeforeInstallPromptEvent(event)) {
        return;
      }
      event.preventDefault();
      setPromptEvent(event);
    };
    const onAppInstalled = (): void => {
      setPromptEvent(undefined);
      setInstalled(true);
      setShowHelp(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed) {
    return null;
  }
  return (
    <span class="install-wrap">
      <button class="install-button" type="button" onClick={() => installOrExplain(promptEvent, setPromptEvent, setShowHelp)}>
        Install App
      </button>
      {showHelp ? <InstallHelpDialog onClose={() => setShowHelp(false)} /> : null}
    </span>
  );
}

function InstallHelpDialog(props: { readonly onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.onClose]);

  return (
    <div class="modal-layer" role="presentation">
      <button class="modal-backdrop" type="button" aria-label="Close install help" onClick={props.onClose} />
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="install-help-title">
        <div class="dialog-mark neutral" aria-hidden="true">App</div>
        <div class="dialog-copy">
          <h2 id="install-help-title">Install Dream Code</h2>
          <p>Open the browser menu and choose Install app or Add to Home screen. Use Chrome or Samsung Internet if this browser does not show that menu item.</p>
        </div>
        <div class="dialog-actions">
          <button class="dialog-button primary" type="button" onClick={props.onClose}>Got it</button>
        </div>
      </section>
    </div>
  );
}

function installOrExplain(
  promptEvent: BeforeInstallPromptEvent | undefined,
  setPromptEvent: (event: BeforeInstallPromptEvent | undefined) => void,
  setShowHelp: (show: boolean) => void,
): void {
  if (promptEvent === undefined) {
    setShowHelp(true);
    return;
  }
  void promptEvent.prompt().then(() => promptEvent.userChoice).finally(() => setPromptEvent(undefined));
}

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return "prompt" in event && typeof event.prompt === "function" && "userChoice" in event;
}

function isStandaloneApp(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || isNavigatorStandalone(navigator);
}

function isNavigatorStandalone(value: Navigator): boolean {
  return "standalone" in value && value.standalone === true;
}
