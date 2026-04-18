import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

// Helper to upload a file and wait for the translate page
async function uploadFile(
  page: import("@playwright/test").Page,
  filename: string,
) {
  await page.goto("/create");
  await page.waitForLoadState("networkidle");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(fixtures, filename));
  await page.waitForURL(/\/translate\//, { timeout: 10000 });
  await page.waitForTimeout(2000);
}

test.describe("Canvas modes", () => {
  test("PPTX renders slide canvas with text regions", async ({ page }) => {
    await uploadFile(page, "sample.pptx");

    // PPTX badge should be visible
    await expect(page.getByText("PPTX")).toBeVisible({ timeout: 10000 });

    // Slide content should render
    await expect(page.getByText("Presentation Title").first()).toBeVisible();
  });

  test("DOCX renders document canvas with DOCX badge", async ({ page }) => {
    await uploadFile(page, "sample.docx");

    // DOCX badge should be visible
    await expect(page.getByText("DOCX")).toBeVisible({ timeout: 10000 });

    // Document content should render
    await expect(
      page.getByText("Welcome to our document").first(),
    ).toBeVisible();
  });

  test("HTML renders preview with HTML badge", async ({ page }) => {
    await uploadFile(page, "sample.html");

    // HTML badge - use exact match to avoid matching DOCTYPE content
    await expect(page.getByText("HTML", { exact: true })).toBeVisible({
      timeout: 10000,
    });

    // HTML content should appear
    await expect(
      page.getByText("Welcome to our website").first(),
    ).toBeVisible();
  });

  test("XLIFF renders segment list editor", async ({ page }) => {
    await uploadFile(page, "sample.xliff");

    await expect(page.getByText("XLIFF")).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("Welcome to our product").first(),
    ).toBeVisible();
  });
});
