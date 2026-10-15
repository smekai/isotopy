export interface Identified {
  id: string;
}

export function mergeById<T extends Identified>(items: T[], update: T): T[] {
  const index = items.findIndex((item) => item.id === update.id);
  if (index === -1) {
    return [update, ...items];
  }
  const next = [...items];
  next[index] = update;
  return next;
}
