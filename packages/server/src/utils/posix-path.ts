import path from "node:path";

export function toPosixPath(nativePath: string): string {
  return nativePath.split(path.sep).join("/");
}
