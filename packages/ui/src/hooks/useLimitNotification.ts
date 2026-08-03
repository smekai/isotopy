import { useCallback, useEffect, useState } from "react";
import type { RunLimit } from "@adhd/core";
import { formatResetAt, limitHeadline } from "../limit";

const BASE_TITLE = "ADHD";

export type NotificationAccess = "unsupported" | "default" | "granted" | "denied";

export interface LimitNotificationController {
  access: NotificationAccess;
  request(): void;
}

function currentAccess(): NotificationAccess {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function notifyLimit(limit: RunLimit): void {
  const reset = formatResetAt(limit.resetAt);
  const body = reset === undefined ? "Waiting for the reset." : `Waiting until ${reset}.`;
  try {
    new Notification(limitHeadline(limit), { body, tag: `adhd-limit-${limit.stageId}` });
  } catch {}
}

export function useLimitNotification(limit: RunLimit | undefined): LimitNotificationController {
  const [access, setAccess] = useState<NotificationAccess>(currentAccess);

  const request = useCallback(() => {
    if (typeof Notification === "undefined") {
      return;
    }
    void Notification.requestPermission()
      .then(setAccess)
      .catch(() => setAccess(currentAccess()));
  }, []);

  useEffect(() => {
    if (!limit) {
      document.title = BASE_TITLE;
      return;
    }
    document.title = `⏸ Limit — ${BASE_TITLE}`;
    if (currentAccess() === "default") {
      request();
      return;
    }
    if (currentAccess() === "granted" && document.hidden) {
      notifyLimit(limit);
    }
  }, [limit, request]);

  useEffect(() => {
    if (access === "granted" && limit && document.hidden) {
      notifyLimit(limit);
    }
  }, [access, limit]);

  return { access, request };
}
