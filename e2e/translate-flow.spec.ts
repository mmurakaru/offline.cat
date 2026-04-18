import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

// Mock the Chrome Translator and LanguageDetector APIs so the full
// translate flow works in headless Chromium.
const MOCK_TRANSLATIONS: Record<string, Record<string, string>> = {
  es: {
    "Welcome to our product": "Bienvenido a nuestro producto",
    "Getting started is easy": "Empezar es facil",
    "Contact us for more information": "Contactenos para mas informacion",
    "Welcome to our website": "Bienvenido a nuestro sitio web",
    "Sample Document": "Documento de ejemplo",
    "This is an introductory paragraph about our services.":
      "Este es un parrafo introductorio sobre nuestros servicios.",
    "Contact us today for a free consultation.":
      "Contactenos hoy para una consulta gratuita.",
    "Welcome to our document": "Bienvenido a nuestro documento",
    "This is the second paragraph with important content.":
      "Este es el segundo parrafo con contenido importante.",
    "Presentation Title": "Titulo de la Presentacion",
    "First slide body text": "Texto del cuerpo de la primera diapositiva",
    "Second Slide Title": "Titulo de la Segunda Diapositiva",
  },
};

function getMockScript(targetLanguage: string) {
  const translations = MOCK_TRANSLATIONS[targetLanguage] ?? {};
  return `
    window.Translator = {
      async availability() { return "available"; },
      async create({ targetLanguage }) {
        const map = ${JSON.stringify(translations)};
        return {
          async translate(text) {
            return map[text] || "[" + targetLanguage + "] " + text;
          },
          destroy() {},
        };
      },
    };
    window.LanguageDetector = {
      async create() {
        return {
          async detect(text) {
            return [{ detectedLanguage: "en", confidence: 0.99 }];
          },
        };
      },
    };
  `;
}

async function setupAndUpload(
  page: import("@playwright/test").Page,
  filename: string,
  targetLanguage = "es",
) {
  // Inject mock APIs before any page JS runs
  await page.addInitScript(getMockScript(targetLanguage));

  await page.goto("/create");
  await page.waitForLoadState("networkidle");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(fixtures, filename));
  await page.waitForURL(/\/translate\//, { timeout: 10000 });
  await page.waitForTimeout(2000);
}

async function selectTargetLanguage(
  page: import("@playwright/test").Page,
  language: string,
) {
  const targetInput = page.getByRole("combobox", { name: "Target language" });
  await targetInput.click();
  await page.waitForTimeout(200);
  await targetInput.fill(language);
  await page.waitForTimeout(200);
  await page.getByRole("option", { name: language }).click();
  await page.waitForTimeout(400);
}

async function clickTranslate(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Translate", exact: true }).click();
  await page.waitForTimeout(2000);
}

test.describe("Translation flow", () => {
  test("XLIFF: select languages, translate, verify results", async ({
    page,
  }) => {
    await setupAndUpload(page, "sample.xliff");

    // Source should be auto-detected as English
    await expect(
      page.getByRole("combobox", { name: "Source language" }),
    ).toHaveValue("English", { timeout: 5000 });

    await selectTargetLanguage(page, "Spanish");
    await clickTranslate(page);

    // Verify translations appeared
    await expect(
      page.getByText("Bienvenido a nuestro producto").first(),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Empezar es facil").first()).toBeVisible();
  });

  test("HTML: select languages, translate, verify results", async ({
    page,
  }) => {
    await setupAndUpload(page, "sample.html");

    await expect(
      page.getByRole("combobox", { name: "Source language" }),
    ).toHaveValue("English", { timeout: 5000 });

    await selectTargetLanguage(page, "Spanish");
    await clickTranslate(page);

    await expect(
      page.getByText("Bienvenido a nuestro sitio web").first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("DOCX: select languages, translate, verify results", async ({
    page,
  }) => {
    await setupAndUpload(page, "sample.docx");

    await expect(
      page.getByRole("combobox", { name: "Source language" }),
    ).toHaveValue("English", { timeout: 5000 });

    await selectTargetLanguage(page, "Spanish");
    await clickTranslate(page);

    await expect(
      page.getByText("Bienvenido a nuestro documento").first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("PPTX: select languages, translate, switch slides", async ({ page }) => {
    await setupAndUpload(page, "sample.pptx");

    await expect(
      page.getByRole("combobox", { name: "Source language" }),
    ).toHaveValue("English", { timeout: 5000 });

    await selectTargetLanguage(page, "Spanish");
    await clickTranslate(page);

    // Switch to outline to see translations
    await page.getByRole("button", { name: "Sidebar view" }).click();
    await page.waitForTimeout(200);
    await page.getByRole("menuitem", { name: "Outline" }).click();
    await page.waitForTimeout(500);

    // Verify slide 1 translations
    await expect(
      page.getByText("Titulo de la Presentacion").first(),
    ).toBeVisible({ timeout: 5000 });

    // Switch to slide 2
    const slide2 = page.getByText("Slide 2").first();
    if (await slide2.isVisible()) {
      await slide2.click();
      await page.waitForTimeout(500);
    }

    // Verify slide 2 content is visible
    await expect(
      page.getByText("Titulo de la Segunda Diapositiva").first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
