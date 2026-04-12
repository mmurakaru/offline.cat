// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarViewToggle } from "./SidebarViewToggle";

describe("<SidebarViewToggle />", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the sidebar view button", () => {
    // Arrange
    const onModeChange = vi.fn();

    // Act
    render(<SidebarViewToggle mode="navigator" onModeChange={onModeChange} />);

    // Assert
    expect(screen.getByRole("button", { name: "Sidebar view" })).toBeTruthy();
  });
});
