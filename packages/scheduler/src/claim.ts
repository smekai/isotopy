export interface ClaimableWindow {
  lastWindowAt?: string;
  updatedAt: string;
}

export type WindowClaim = { ok: true } | { ok: false; error: unknown };

/**
 * Claiming is a durable write that happens *before* the work it authorises. If
 * the write fails the previous window is restored, so nothing is started that
 * could not be recorded — a crash between starting and recording would otherwise
 * let the same window be paid for twice.
 */
export async function claimWindow<T extends ClaimableWindow>(
  record: T,
  now: string,
  persist: (record: T) => Promise<void>,
): Promise<WindowClaim> {
  const previousWindow = record.lastWindowAt;
  record.lastWindowAt = now;
  record.updatedAt = now;
  try {
    await persist(record);
    return { ok: true };
  } catch (error) {
    record.lastWindowAt = previousWindow;
    return { ok: false, error };
  }
}
