// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SlashCommandMenu } from "./SlashCommandMenu";

const mockItems = [
  { id: "source", label: "Source", description: "Insert the source text" },
  { id: "ai", label: "AI Translate", description: "Translate with AI" },
  { id: "voice", label: "Voice", description: "Dictate with voice" },
];

describe("<SlashCommandMenu />", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all command items", () => {
    // Arrange
    const command = vi.fn();

    // Act
    render(<SlashCommandMenu items={mockItems} command={command} />);

    // Assert
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
  });

  it("renders descriptions for each command", () => {
    // Arrange
    const command = vi.fn();

    // Act
    render(<SlashCommandMenu items={mockItems} command={command} />);

    // Assert
    expect(screen.getByText("Insert the source text")).toBeTruthy();
    expect(screen.getByText("Translate with AI")).toBeTruthy();
    expect(screen.getByText("Dictate with voice")).toBeTruthy();
  });

  it("calls command with the clicked item", async () => {
    // Arrange
    const user = userEvent.setup();
    const command = vi.fn();

    // Act
    render(<SlashCommandMenu items={mockItems} command={command} />);
    const aiButton = screen.getByText("Translate with AI").closest("button")!;
    await user.click(aiButton);

    // Assert
    expect(command).toHaveBeenCalledWith(mockItems[1]);
  });

  it("renders nothing when items array is empty", () => {
    // Arrange
    const command = vi.fn();

    // Act
    const { container } = render(
      <SlashCommandMenu items={[]} command={command} />,
    );

    // Assert
    expect(container.innerHTML).toBe("");
  });

  it("highlights the first item by default", () => {
    // Arrange
    const command = vi.fn();

    // Act
    render(<SlashCommandMenu items={mockItems} command={command} />);

    // Assert
    const firstButton = screen.getByText("Insert the source text").closest("button")!;
    const secondButton = screen.getByText("Translate with AI").closest("button")!;
    expect(firstButton.className).toContain("primary");
    expect(secondButton.className).not.toContain("primary");
  });
});
