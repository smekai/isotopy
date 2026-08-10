// Component test: this panel is the whole of "see what was built". A run that
// says nothing about its files is the gap TASK-126 exists to close, so what is
// worth guarding is that every kind of change is named, that a file's contents
// are one click away, and that a partial list admits it.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ChangedFilesPanel } from "../../src/components/run/ChangedFilesPanel";
import { DIRS } from "../../src/theme";
import { changes } from "../support/run-fixtures";

const fetchRunFileContent = vi.fn();
const revealRunFolder = vi.fn();

vi.mock("../../src/api", () => ({
  fetchRunFileContent: (...args: unknown[]) => fetchRunFileContent(...args),
  revealRunFolder: (...args: unknown[]) => revealRunFolder(...args),
}));

const d = DIRS.indigo;

const RUN_ID = "r1";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("the headline counts what was created and what was edited", () => {
  // Act
  render(<ChangedFilesPanel runId={RUN_ID} changes={changes()} d={d} />);

  // Assert
  expect(screen.getByText("1 created · 1 edited")).toBeDefined();
});

test("every changed file is named beside the kind of change it was", () => {
  // Act
  render(<ChangedFilesPanel runId={RUN_ID} changes={changes()} d={d} />);

  // Assert
  const list = screen.getByTestId("artifact-changes");
  expect(within(list).getByText("src/app.ts")).toBeDefined();
  expect(within(list).getByText("README.md")).toBeDefined();
  expect(within(list).getByText("created")).toBeDefined();
});

test("picking a file reads it out of the workspace", async () => {
  // Arrange
  fetchRunFileContent.mockResolvedValue({
    path: "src/app.ts",
    size: 24,
    content: "export const app = 1;",
    truncated: false,
  });
  render(<ChangedFilesPanel runId={RUN_ID} changes={changes()} d={d} />);

  // Act
  fireEvent.click(screen.getByText("src/app.ts"));

  // Assert
  await waitFor(() =>
    expect(screen.getByText("export const app = 1;")).toBeDefined(),
  );
});

test("switching files does not leave the previous file's text on screen", async () => {
  // Arrange
  fetchRunFileContent.mockResolvedValueOnce({
    path: "src/app.ts",
    size: 24,
    content: "export const app = 1;",
    truncated: false,
  });
  render(<ChangedFilesPanel runId={RUN_ID} changes={changes()} d={d} />);
  fireEvent.click(screen.getByText("src/app.ts"));
  await waitFor(() => expect(screen.getByText("export const app = 1;")).toBeDefined());
  fetchRunFileContent.mockReturnValueOnce(new Promise(() => {}));

  // Act
  fireEvent.click(screen.getByText("README.md"));

  // Assert
  expect(screen.queryByText("export const app = 1;")).toBeNull();
});

test("a deleted file offers no preview, because there is nothing left to read", () => {
  // Arrange
  const deleted = changes({ files: [{ path: "old.ts", kind: "deleted" }] });

  // Act
  render(<ChangedFilesPanel runId={RUN_ID} changes={deleted} d={d} />);

  // Assert
  expect(screen.getByText("old.ts").closest("button")?.disabled).toBe(true);
});

test("a truncated snapshot says so rather than passing itself off as the whole list", () => {
  // Act
  render(<ChangedFilesPanel runId={RUN_ID} changes={changes({ truncated: true })} d={d} />);

  // Assert
  expect(screen.getByText(/may be incomplete/)).toBeDefined();
});

test("a run that changed nothing says so instead of showing an empty list", () => {
  // Act
  render(<ChangedFilesPanel runId={RUN_ID} changes={changes({ files: [] })} d={d} />);

  // Assert
  expect(screen.getByText("This run did not change any files.")).toBeDefined();
});

test("opening the project folder asks the server to reveal it for this run", () => {
  // Arrange
  revealRunFolder.mockResolvedValue({ path: "C:/work/run-1" });
  render(<ChangedFilesPanel runId={RUN_ID} changes={changes()} d={d} />);

  // Act
  fireEvent.click(screen.getByTestId("open-project-folder"));

  // Assert
  expect(revealRunFolder).toHaveBeenCalledWith(RUN_ID);
});
