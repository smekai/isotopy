import { useCallback, useEffect, useState } from "react";
import { parseRoute, routeHash } from "../route";
import type { Route } from "../route";

export interface RouteController {
  route: Route;
  navigate: (next: Route) => void;
  replace: (next: Route) => void;
}

export function useRoute(): RouteController {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const sync = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = routeHash(next);
    if (hash === window.location.hash) {
      return;
    }
    window.location.hash = hash;
  }, []);

  const replace = useCallback((next: Route) => {
    window.history.replaceState(null, "", routeHash(next));
    setRoute(next);
  }, []);

  return { route, navigate, replace };
}
