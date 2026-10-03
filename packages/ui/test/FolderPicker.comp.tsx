// Component test: registering a project you already have starts with a path in
// hand, so the picker must take a typed or pasted path, list it through the
// server's /fs boundary, and never strand the user when a path is wrong.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { FolderPicker } from "../src/components/FolderPicker";
import type { FolderPickerProps } from "../src/components/FolderPicker";
import { fetchDirectories } from "../src/api";
import type { DirectoryListing } from "../src/api";
import { DIRS } from "../src/theme";
import { deferred } from "./support/deferred";

vi.mock("../src/api", () => ({
  fetchDirectories: vi.fn(),
}));

const listDirectories = vi.mocked(fetchDirectories);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("pressing Enter in the path field lists the folder that was typed", async () => {
  // Arrange
  listDirectories.mockResolvedValueOnce(listing({ path: "/home/me" }));
  render(<FolderPicker {...pickerProps({ initialPath: "/home/me" })} />);
  const field = await pathFieldShowing("/home/me");
  fireEvent.change(field, { target: { value: "/home/me/app" } });

  // Anticipate
  listDirectories.mockResolvedValueOnce(listing({ path: "/home/me/app" }));

  // Act
  fireEvent.keyDown(field, { key: "Enter" });

  // Assert
  expect(await pathFieldShowing("/home/me/app")).toBeTruthy();
  expect(listDirectories).toHaveBeenLastCalledWith("/home/me/app", undefined);
});

test("Select hands back the folder the server resolved, not the text that was typed", async () => {
  // Arrange
  const props = pickerProps();
  listDirectories.mockResolvedValueOnce(listing({ path: "", isRootList: true, entries: ["/"] }));
  listDirectories.mockResolvedValueOnce(listing({ path: "/home/me/app" }));
  render(<FolderPicker {...props} />);
  const field = await pathFieldShowing("");
  fireEvent.change(field, { target: { value: "/home/me/../me/app" } });
  fireEvent.keyDown(field, { key: "Enter" });
  await pathFieldShowing("/home/me/app");

  // Act
  fireEvent.click(screen.getByRole("button", { name: "Select this folder" }));

  // Assert
  expect(props.onSelect).toHaveBeenCalledWith("/home/me/app");
});

test("a path that cannot be listed says why, and the field returns to the folder Select would add", async () => {
  // Arrange
  listDirectories.mockResolvedValueOnce(listing({ path: "/home/me" }));
  render(<FolderPicker {...pickerProps({ initialPath: "/home/me" })} />);
  const field = await pathFieldShowing("/home/me");
  fireEvent.change(field, { target: { value: "/home/me/typo" } });

  // Anticipate
  listDirectories.mockRejectedValueOnce(new Error("Directory does not exist: /home/me/typo"));

  // Act
  fireEvent.keyDown(field, { key: "Enter" });

  // Assert
  expect((await screen.findByRole("alert")).textContent).toContain("/home/me/typo");
  expect(field.value).toBe("/home/me");
  expect(screen.getByRole("button", { name: "Select this folder" })).toHaveProperty("disabled", false);
});

test("a path pasted while the first listing is still loading survives that listing arriving", async () => {
  // Arrange — the first listing reads every drive on Windows, so it can take a while.
  const firstListing = deferred<DirectoryListing>();
  listDirectories.mockReturnValueOnce(firstListing.promise);
  render(<FolderPicker {...pickerProps()} />);
  const field = await pathFieldShowing("");
  fireEvent.change(field, { target: { value: "/home/me/app" } });

  // Act
  await act(async () => {
    firstListing.resolve(listing({ path: "", isRootList: true, entries: ["/"] }));
  });

  // Assert
  expect(await screen.findByRole("button", { name: "/" })).toBeTruthy();
  expect(field.value).toBe("/home/me/app");
});

function pickerProps(overrides: Partial<FolderPickerProps> = {}): FolderPickerProps {
  return {
    d: overrides.d ?? DIRS.indigo,
    initialPath: overrides.initialPath,
    onSelect: overrides.onSelect ?? vi.fn(),
    onClose: overrides.onClose ?? vi.fn(),
  };
}

function listing(overrides: Partial<DirectoryListing> = {}): DirectoryListing {
  return {
    path: overrides.path ?? "/home/me",
    parent: overrides.parent ?? null,
    entries: overrides.entries ?? [],
    isRootList: overrides.isRootList ?? false,
  };
}

async function pathFieldShowing(value: string): Promise<HTMLInputElement> {
  return (await screen.findByDisplayValue(value)) as HTMLInputElement;
}
