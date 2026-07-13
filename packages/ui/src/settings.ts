const STORAGE_KEY = "adhd.disabledStages";

export function loadDisabledStages(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveDisabledStages(stageIds: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stageIds));
  } catch {
    // ignore storage failures
  }
}
