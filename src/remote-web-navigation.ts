import { useEffect, useRef, useState } from "preact/hooks";

import {
  historyStateForScreen,
  homeScreen,
  routeForScreen,
  screenFromHistoryState,
  type RemoteScreen,
} from "./remote-web-screen.js";

export type NavigationDirection = "forward" | "back" | "replace";

export type RemoteNavigation = {
  readonly screen: RemoteScreen;
  readonly direction: NavigationDirection;
  readonly goBack: () => void;
  readonly navigate: (screen: RemoteScreen) => void;
  readonly replace: (update: RemoteScreen | ((screen: RemoteScreen) => RemoteScreen)) => void;
};

export function useRemoteNavigation(): RemoteNavigation {
  const [screen, setScreen] = useState<RemoteScreen>(homeScreen);
  const [direction, setDirection] = useState<NavigationDirection>("replace");
  const screenRef = useRef(screen);
  const indexRef = useRef(0);
  screenRef.current = screen;

  useEffect(() => {
    window.history.replaceState(historyStateWithIndex(homeScreen, indexRef.current), "", routeForScreen(homeScreen));
    const onPopState = (event: PopStateEvent): void => {
      const nextIndex = historyIndexFromState(event.state);
      setDirection(nextIndex < indexRef.current ? "back" : "forward");
      indexRef.current = nextIndex;
      setScreen(screenFromHistoryState(event.state));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return {
    screen,
    direction,
    goBack: () => window.history.back(),
    navigate: (next) => {
      const nextIndex = indexRef.current + 1;
      indexRef.current = nextIndex;
      setDirection("forward");
      window.history.pushState(historyStateWithIndex(next, nextIndex), "", routeForScreen(next));
      setScreen(next);
    },
    replace: (update) => {
      const next = typeof update === "function" ? update(screenRef.current) : update;
      setDirection("replace");
      window.history.replaceState(historyStateWithIndex(next, indexRef.current), "", routeForScreen(next));
      setScreen(next);
    },
  };
}

function historyStateWithIndex(screen: RemoteScreen, index: number): { readonly dreamRemote: true; readonly screen: RemoteScreen; readonly index: number } {
  return { ...historyStateForScreen(screen), index };
}

function historyIndexFromState(value: unknown): number {
  if (!isRecord(value) || typeof value["index"] !== "number") {
    return 0;
  }
  return value["index"];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
