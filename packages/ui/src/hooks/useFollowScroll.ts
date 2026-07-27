import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const FOLLOW_THRESHOLD_PX = 40;

export interface FollowScrollOptions {
  /** Grows as content arrives — the signal to scroll again. */
  length: number;
  /** Changing this re-arms following, e.g. a new stage or a new run. */
  resetKey: string;
  enabled?: boolean;
}

export interface FollowScrollController {
  ref: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}

export function useFollowScroll({
  length,
  resetKey,
  enabled = true,
}: FollowScrollOptions): FollowScrollController {
  const ref = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  function onScroll() {
    const el = ref.current;
    if (el) {
      following.current =
        el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD_PX;
    }
  }

  useEffect(() => {
    following.current = true;
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const el = ref.current;
    if (el && following.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [enabled, length, resetKey]);

  return { ref, onScroll };
}
