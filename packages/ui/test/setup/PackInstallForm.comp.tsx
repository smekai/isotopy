// Component test: "Add agents from…" sends what the owner typed and nothing they left
// blank, and a refusal keeps their input on screen next to the server's reason, so a
// conflict listing three files can be fixed and retried without retyping the source.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PackInstallForm } from "../../src/components/setup/PackInstallForm";
import type { PackInstallFormProps } from "../../src/components/setup/PackInstallForm";
import { DIRS } from "../../src/theme";
import { installResult } from "../support/agent-fixtures";

afterEach(() => {
  cleanup();
});

test("Install stays disabled until a source is typed", () => {
  // Act
  render(<PackInstallForm {...formProps()} />);

  // Assert
  expect(screen.getByRole("button", { name: "Install" }).hasAttribute("disabled")).toBe(true);
});

test("Install sends the source, ref and folder the owner typed", async () => {
  // Arrange
  const props = formProps();
  render(<PackInstallForm {...props} />);
  type("Pack source", "https://github.com/smekai/isotopy.git");
  type("Git ref", "main");
  type("Folder inside the repository", "docs/dogfood/agent-pack");

  // Act
  fireEvent.click(screen.getByRole("button", { name: "Install" }));

  // Assert
  await screen.findByText(/Installed from/);
  expect(props.onInstall).toHaveBeenCalledWith({
    source: "https://github.com/smekai/isotopy.git",
    ref: "main",
    path: "docs/dogfood/agent-pack",
  });
});

test("a ref and folder left blank are not sent, because the server reads blank as invalid", async () => {
  // Arrange
  const props = formProps();
  render(<PackInstallForm {...props} />);
  type("Pack source", "C:\\packs\\seo");

  // Act
  fireEvent.click(screen.getByRole("button", { name: "Install" }));

  // Assert
  await screen.findByText(/Installed from/);
  expect(props.onInstall).toHaveBeenCalledWith({ source: "C:\\packs\\seo" });
});

test("a refusal shows the server's reason and keeps what the owner typed", async () => {
  // Arrange
  const reason = "agents/seo-writer/agent.md is edited since this pack installed it";
  const props = formProps({ onInstall: vi.fn(() => Promise.reject(new Error(reason))) });
  render(<PackInstallForm {...props} />);
  type("Pack source", "C:\\packs\\seo");

  // Act
  fireEvent.click(screen.getByRole("button", { name: "Install" }));

  // Assert
  expect(await screen.findByText(reason)).toBeTruthy();
  expect((screen.getByLabelText("Pack source") as HTMLInputElement).value).toBe("C:\\packs\\seo");
});

function type(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function formProps(overrides: Partial<PackInstallFormProps> = {}): PackInstallFormProps {
  return {
    d: overrides.d ?? DIRS.indigo,
    onInstall: overrides.onInstall ?? vi.fn(() => Promise.resolve(installResult())),
  };
}
