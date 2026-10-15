import { stat } from "node:fs/promises";
import path from "node:path";

export async function isRepositoryRoot(directory: string): Promise<boolean> {
  try {
    await stat(path.join(directory, ".git"));
    return true;
  } catch {
    return false;
  }
}
