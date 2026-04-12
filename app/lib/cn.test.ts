import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("merges class names", () => {
    // Arrange & Act
    const result = cn("foo", "bar");

    // Assert
    expect(result).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    // Arrange & Act
    const result = cn("base", false && "hidden", "visible");

    // Assert
    expect(result).toBe("base visible");
  });

  it("returns empty string for no arguments", () => {
    // Arrange & Act
    const result = cn();

    // Assert
    expect(result).toBe("");
  });
});
