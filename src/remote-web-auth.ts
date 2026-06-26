import { useEffect, useState } from "preact/hooks";

import { requestJson, type DeviceDto } from "./remote-web-api.js";

export type AuthState =
  | { readonly kind: "checking" }
  | { readonly kind: "pairing" }
  | { readonly kind: "paired"; readonly device: DeviceDto };

export type RemoteAuthState = {
  readonly state: AuthState;
  readonly pair: () => void;
  readonly forget: () => void;
};

const pairedMarker = "cookie";

export function useRemoteAuth(pairedStorageKey: string): RemoteAuthState {
  const [state, setState] = useState<AuthState>(() => {
    const paired = window.localStorage.getItem(pairedStorageKey) === pairedMarker;
    return paired ? { kind: "checking" } : { kind: "pairing" };
  });

  useEffect(() => {
    if (window.localStorage.getItem(pairedStorageKey) !== pairedMarker) {
      setState({ kind: "pairing" });
      return;
    }
    let active = true;
    requestJson<{ readonly device: DeviceDto }>("GET", "/api/me").then((result) => {
      if (active) {
        setState({ kind: "paired", device: result.device });
      }
    }).catch((error: unknown) => {
      if (active && error instanceof Error) {
        window.localStorage.removeItem(pairedStorageKey);
        setState({ kind: "pairing" });
      }
    });
    return () => {
      active = false;
    };
  }, [pairedStorageKey]);

  return {
    state,
    pair: () => {
      window.localStorage.setItem(pairedStorageKey, pairedMarker);
      requestJson<{ readonly device: DeviceDto }>("GET", "/api/me").then((result) => {
        setState({ kind: "paired", device: result.device });
      }).catch((error: unknown) => {
        if (error instanceof Error) {
          window.localStorage.removeItem(pairedStorageKey);
          setState({ kind: "pairing" });
        }
      });
    },
    forget: () => {
      window.localStorage.removeItem(pairedStorageKey);
      void requestJson<{ readonly ok: true }>("POST", "/api/logout").catch(() => undefined);
      setState({ kind: "pairing" });
    },
  };
}
