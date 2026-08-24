import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Z } from "../theme";

const SCRIM = "rgba(30,27,75,0.20)";

const BACKDROP: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: SCRIM,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: Z.overlay,
};

export interface DialogProps {
  label: string;
  testId: string;
  panelStyle: CSSProperties;
  backdropStyle?: CSSProperties;
  onDismiss: () => void;
  children: ReactNode;
}

export function Dialog({
  label,
  testId,
  panelStyle,
  backdropStyle,
  onDismiss,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<Element | null>(null);
  // Callers pass inline closures, so depending on the callback would tear the
  // dialog down on every parent render and steal focus from the field in use.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    restoreFocusTo.current = document.activeElement;
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismiss.current();
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
  }, []);

  return (
    <div style={backdropStyle ?? BACKDROP} onClick={onDismiss}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
        style={panelStyle}
      >
        {children}
      </div>
    </div>
  );
}
