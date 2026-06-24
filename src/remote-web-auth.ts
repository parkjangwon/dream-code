import { useEffect, useState } from "preact/hooks";

import { requestJson, type DeviceDto } from "./remote-web-api.js";

export type AuthState =
  | { readonly kind: "checking" }
  | { readonly kind: "pairing" }
  | { readonly kind: "paired"; readonly token: string; readonly device: DeviceDto };

export type RemoteAuthState = {
  readonly state: AuthState;
  readonly pair: (token: string) => void;
  readonly forget: () => void;
};

export function useRemoteAuth(tokenKey: string): RemoteAuthState {
  const [state, setState] = useState<AuthState>(() => {
    const token = window.localStorage.getItem(tokenKey) ?? "";
    return token.length === 0 ? { kind: "pairing" } : { kind: "checking" };
  });

  useEffect(() => {
    const token = window.localStorage.getItem(tokenKey) ?? "";
    if (token.length === 0) {
      setState({ kind: "pairing" });
      return;
    }
    let active = true;
    requestJson<{ readonly device: DeviceDto }>("GET", "/api/me", undefined, token).then((result) => {
      if (active) {
        setState({ kind: "paired", token, device: result.device });
      }
    }).catch((error: unknown) => {
      if (active && error instanceof Error) {
        window.localStorage.removeItem(tokenKey);
        setState({ kind: "pairing" });
      }
    });
    return () => {
      active = false;
    };
  }, [tokenKey]);

  return {
    state,
    pair: (token) => {
      window.localStorage.setItem(tokenKey, token);
      requestJson<{ readonly device: DeviceDto }>("GET", "/api/me", undefined, token).then((result) => {
        setState({ kind: "paired", token, device: result.device });
      }).catch((error: unknown) => {
        if (error instanceof Error) {
          window.localStorage.removeItem(tokenKey);
          setState({ kind: "pairing" });
        }
      });
    },
    forget: () => {
      window.localStorage.removeItem(tokenKey);
      setState({ kind: "pairing" });
    },
  };
}
