import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DIRS } from "./theme";
import type { Dir, DirId } from "./theme";

const STORAGE_KEY = "adhd.direction";

interface ThemeValue {
  dirId: DirId;
  d: Dir;
  setDirId: (id: DirId) => void;
}

const ThemeContext = createContext<ThemeValue>({
  dirId: "indigo",
  d: DIRS.indigo,
  setDirId: () => undefined,
});

function loadDirId(): DirId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in DIRS) {
      return saved as DirId;
    }
  } catch {
    // localStorage unavailable — fall through to default
  }
  return "indigo";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dirId, setDirIdState] = useState<DirId>(loadDirId);

  const setDirId = useCallback((id: DirId) => {
    setDirIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore storage failures
    }
  }, []);

  const value = useMemo(
    () => ({ dirId, d: DIRS[dirId], setDirId }),
    [dirId, setDirId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
