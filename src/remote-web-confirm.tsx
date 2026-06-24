import { h } from "preact";
import { useEffect } from "preact/hooks";

import type { SessionDto } from "./remote-web-api.js";

export function SessionDeleteDialog(props: {
  readonly busy: boolean;
  readonly session: SessionDto;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const name = sessionName(props.session);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !props.busy) {
        props.onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.busy, props.onCancel]);

  return (
    <div class="modal-layer" role="presentation">
      <button class="modal-backdrop" type="button" aria-label="Cancel delete" disabled={props.busy} onClick={props.onCancel} />
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-session-title">
        <div class="dialog-mark" aria-hidden="true">!</div>
        <div class="dialog-copy">
          <h2 id="delete-session-title">Delete session?</h2>
          <p>This removes <strong>{name}</strong> from Dream Code on this machine. This cannot be undone.</p>
        </div>
        <div class="dialog-actions">
          <button class="dialog-button secondary" type="button" disabled={props.busy} onClick={props.onCancel}>Cancel</button>
          <button class="dialog-button danger" type="button" disabled={props.busy} onClick={props.onConfirm}>
            {props.busy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function LogoutDialog(props: {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        props.onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.onCancel]);

  return (
    <div class="modal-layer" role="presentation">
      <button class="modal-backdrop" type="button" aria-label="Cancel logout" onClick={props.onCancel} />
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title">
        <div class="dialog-mark neutral" aria-hidden="true">Out</div>
        <div class="dialog-copy">
          <h2 id="logout-title">Logout from this device?</h2>
          <p>You will need the pairing code again before this browser can control Dream Code Remote.</p>
        </div>
        <div class="dialog-actions">
          <button class="dialog-button secondary" type="button" onClick={props.onCancel}>Cancel</button>
          <button class="dialog-button danger" type="button" onClick={props.onConfirm}>Logout</button>
        </div>
      </section>
    </div>
  );
}

function sessionName(session: SessionDto): string {
  return session.name ?? session.summary ?? session.id;
}
