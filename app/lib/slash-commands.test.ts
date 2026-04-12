import { describe, expect, it, vi } from "vitest";
import {
  executeCommand,
  filterCommands,
  getSlashCommands,
} from "./slash-commands";

describe("getSlashCommands", () => {
  it("returns all commands when query is empty", () => {
    // Arrange
    const commands = getSlashCommands();

    // Act
    const filtered = filterCommands(commands, "");

    // Assert
    expect(filtered).toHaveLength(commands.length);
  });

  it("filters commands by query", () => {
    // Arrange
    const commands = getSlashCommands();

    // Act
    const filtered = filterCommands(commands, "so");

    // Assert
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("source");
  });

  it("returns empty array when no commands match", () => {
    // Arrange
    const commands = getSlashCommands();

    // Act
    const filtered = filterCommands(commands, "zzz");

    // Assert
    expect(filtered).toHaveLength(0);
  });

  it("includes source, ai, and voice commands", () => {
    // Arrange & Act
    const commands = getSlashCommands();
    const ids = commands.map((command) => command.id);

    // Assert
    expect(ids).toContain("source");
    expect(ids).toContain("ai");
    expect(ids).toContain("voice");
  });

  it("excludes ai command when canTranslate is false", () => {
    // Arrange & Act
    const commands = getSlashCommands({ canTranslate: false });
    const ids = commands.map((command) => command.id);

    // Assert
    expect(ids).not.toContain("ai");
    expect(ids).toContain("source");
    expect(ids).toContain("voice");
  });
});

describe("executeCommand", () => {
  it("/source calls onInsertSource", () => {
    // Arrange
    const callbacks = {
      onInsertSource: vi.fn(),
      onTranslateSegment: vi.fn(),
      onStartDictation: vi.fn(),
    };

    // Act
    executeCommand("source", callbacks);

    // Assert
    expect(callbacks.onInsertSource).toHaveBeenCalledOnce();
    expect(callbacks.onTranslateSegment).not.toHaveBeenCalled();
  });

  it("/ai calls onTranslateSegment", () => {
    // Arrange
    const callbacks = {
      onInsertSource: vi.fn(),
      onTranslateSegment: vi.fn(),
      onStartDictation: vi.fn(),
    };

    // Act
    executeCommand("ai", callbacks);

    // Assert
    expect(callbacks.onTranslateSegment).toHaveBeenCalledOnce();
    expect(callbacks.onInsertSource).not.toHaveBeenCalled();
  });

  it("/voice calls onStartDictation", () => {
    // Arrange
    const callbacks = {
      onInsertSource: vi.fn(),
      onTranslateSegment: vi.fn(),
      onStartDictation: vi.fn(),
    };

    // Act
    executeCommand("voice", callbacks);

    // Assert
    expect(callbacks.onStartDictation).toHaveBeenCalledOnce();
  });
});
