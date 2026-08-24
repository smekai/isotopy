import { useEffect, useRef } from "react";
import type { RefObject } from "react";

export function useDialogDismiss(onDismiss: () => void): RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<Element | null>(null);

  useEffect(() => {
    restoreFocusTo.current = document.activeElement;
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const restore = restoreFocusTo.current;
      if (restore instanceof HTMLElement) {
        restore.focus();
      }
    };
  }, [onDismiss]);

  return dialogRef;
}
