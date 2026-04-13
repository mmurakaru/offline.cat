import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

// Helper to upload a file and wait for the translate page
async function uploadFile(page: import("@playwright/test").Page, filename: string) {
  await page.goto("/create");
  await page.waitForLoadState("networkidle");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(fixtures, filename));
  await page.waitForURL(/\/translate\//, { timeout: 10000 });
  // Wait for segments to load
  await page.waitForTimeout(2000);
}

test.describe("Upload and parse", () => {
  test("HTML: uploads and shows segments", async ({ page }) => {
    await uploadFile(page, "sample.html");

    // Should show segment text from HTML
    await expect(page.getByText("Welcome to our website").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("DOCX: uploads and shows document canvas", async ({ page }) => {
    await uploadFile(page, "sample.docx");

    // Text appears in both sidebar and canvas - use first()
    await expect(page.getByText("Welcome to our document").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("PPTX: uploads and shows slide canvas", async ({ page }) => {
    await uploadFile(page, "sample.pptx");

    // Should show segments from the slides
    await expect(page.getByText("Presentation Title").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("PPTX: shows PPTX badge", async ({ page }) => {
    await uploadFile(page, "sample.pptx");

    await expect(page.getByText("PPTX")).toBeVisible({ timeout: 10000 });
  });

  test("XLIFF: uploads and shows segment list", async ({ page }) => {
    await uploadFile(page, "sample.xliff");

    await expect(page.getByText("Welcome to our product").first()).toBeVisible({
      timeout: 10000,
    });
  });
});
