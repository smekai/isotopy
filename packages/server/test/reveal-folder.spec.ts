import { expect, test } from "vitest";
import { revealCommand } from "../src/utils/reveal-folder.ts";

const TARGET = "C:\\projects\\app";

test("Windows opens the folder through Explorer", () => {
  expect(revealCommand("win32", TARGET)).toEqual({
    executable: "explorer.exe",
    args: [TARGET],
  });
});

test("macOS opens the folder through open", () => {
  expect(revealCommand("darwin", "/Users/dev/app")).toEqual({
    executable: "open",
    args: ["/Users/dev/app"],
  });
});

test("every other platform falls back to the freedesktop opener", () => {
  expect(revealCommand("linux", "/home/dev/app")).toEqual({
    executable: "xdg-open",
    args: ["/home/dev/app"],
  });
});

test("the path is one argument, never spliced into a shell string", () => {
  expect(revealCommand("darwin", "/Users/dev/my app").args).toEqual(["/Users/dev/my app"]);
});
