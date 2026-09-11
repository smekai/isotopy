import { readFile, stat } from "node:fs/promises";

interface CacheEntry {
  mtimeMs: number;
  content: string;
}

const cache = new Map<string, CacheEntry>();

export async function readCachedText(filePath: string): Promise<string | undefined> {
  try {
    const { mtimeMs } = await stat(filePath);
    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.content;
    }
    const content = await readFile(filePath, "utf8");
    cache.set(filePath, { mtimeMs, content });
    return content;
  } catch {
    cache.delete(filePath);
    return undefined;
  }
}
