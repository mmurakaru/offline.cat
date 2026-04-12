// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarViewToggle } from "./SidebarViewToggle";

describe("<SidebarViewToggle />", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the sidebar view button", () => {
    const onModeChange = vi.fn();

    render(
      <SidebarViewToggle
        mode="outline"
        onModeChange={onModeChange}
        fileType="docx"
      />,
    );

    expect(screen.getByRole("button", { name: "Sidebar view" })).toBeTruthy();
  });
});
