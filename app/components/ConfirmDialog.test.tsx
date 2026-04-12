// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "react-aria-components";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("<ConfirmDialog />", () => {
  const onConfirm = vi.fn();

  afterEach(() => {
    onConfirm.mockClear();
    cleanup();
  });

  it("does not show the dialog initially", () => {
    // Arrange & Act
    render(
      <ConfirmDialog
        title="Discard translations?"
        description="Progress will be lost."
        confirmLabel="Discard & continue"
        onConfirm={onConfirm}
      >
        <Button>Open</Button>
      </ConfirmDialog>,
    );

    // Assert
    expect(screen.queryByText("Discard translations?")).toBeNull();
  });

  it("opens the dialog when the trigger is clicked", async () => {
    // Arrange
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        title="Discard translations?"
        description="Progress will be lost."
        confirmLabel="Discard & continue"
        onConfirm={onConfirm}
      >
        <Button>Open</Button>
      </ConfirmDialog>,
    );

    // Act
    await user.click(screen.getByText("Open"));

    // Assert
    expect(screen.getByText("Discard translations?")).toBeTruthy();
    expect(screen.getByText("Progress will be lost.")).toBeTruthy();
    expect(screen.getByText("Discard & continue")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("closes the dialog when Cancel is clicked", async () => {
    // Arrange
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        title="Discard translations?"
        description="Progress will be lost."
        confirmLabel="Discard & continue"
        onConfirm={onConfirm}
      >
        <Button>Open</Button>
      </ConfirmDialog>,
    );

    // Act
    await user.click(screen.getByText("Open"));
    await user.click(screen.getByText("Cancel"));

    // Assert
    expect(screen.queryByText("Discard translations?")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm when the confirm button is clicked", async () => {
    // Arrange
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        title="Discard translations?"
        description="Progress will be lost."
        confirmLabel="Discard & continue"
        onConfirm={onConfirm}
      >
        <Button>Open</Button>
      </ConfirmDialog>,
    );

    // Act
    await user.click(screen.getByText("Open"));
    await user.click(screen.getByText("Discard & continue"));

    // Assert
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("closes the dialog when Escape is pressed", async () => {
    // Arrange
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        title="Discard translations?"
        description="Progress will be lost."
        confirmLabel="Discard & continue"
        onConfirm={onConfirm}
      >
        <Button>Open</Button>
      </ConfirmDialog>,
    );

    // Act
    await user.click(screen.getByText("Open"));
    await user.keyboard("{Escape}");

    // Assert
    expect(screen.queryByText("Discard translations?")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
