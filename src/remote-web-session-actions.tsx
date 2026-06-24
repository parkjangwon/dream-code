import { h } from "preact";
import { useEffect, useState } from "preact/hooks";

import type { SessionDto } from "./remote-web-api.js";

export function ThreadActions(props: {
  readonly onRename: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div class="thread-actions">
      <button class="more-button" type="button" aria-label="Thread actions" onClick={() => setOpen((current) => !current)}>...</button>
      {open ? (
        <div class="action-popover" role="menu" aria-label="Thread actions">
          <button type="button" role="menuitem" onClick={() => {
            setOpen(false);
            props.onRename();
          }}>
            Rename thread
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function RenameSessionDialog(props: {
  readonly busy: boolean;
  readonly session: SessionDto;
  readonly onCancel: () => void;
  readonly onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(sessionName(props.session));
  const trimmed = name.trim();
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
      <button class="modal-backdrop" type="button" aria-label="Cancel rename" disabled={props.busy} onClick={props.onCancel} />
      <form class="confirm-dialog rename-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-session-title" onSubmit={(event) => {
        event.preventDefault();
        if (trimmed.length > 0) {
          props.onConfirm(trimmed);
        }
      }}>
        <div class="dialog-mark neutral" aria-hidden="true">Edit</div>
        <div class="dialog-copy">
          <h2 id="rename-session-title">Rename thread</h2>
          <p>Give this Dream Code thread a name that is easy to find later.</p>
        </div>
        <input class="dialog-input" value={name} disabled={props.busy} autoFocus onInput={(event) => setName(event.currentTarget.value)} />
        <div class="dialog-actions">
          <button class="dialog-button secondary" type="button" disabled={props.busy} onClick={props.onCancel}>Cancel</button>
          <button class="dialog-button primary" type="submit" disabled={props.busy || trimmed.length === 0}>
            {props.busy ? "Saving..." : "Save name"}
          </button>
        </div>
      </form>
    </div>
  );
}

function sessionName(session: SessionDto): string {
  return session.name ?? session.summary ?? session.id;
}
