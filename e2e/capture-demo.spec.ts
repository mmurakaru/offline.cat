// Records the homepage demo video (~10s loop).
// Run:  npx playwright test capture-demo --reporter=list
//
// Not part of the regular test suite - run manually when you need a fresh video.

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);
const screenshotsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "screenshots",
);

const MOCK_TRANSLATIONS_ES: Record<string, string> = {
  "Acme Series A": "Acme Serie A",
  "The operating system for global supply chains":
    "El sistema operativo para cadenas de suministro globales",
  "The Problem": "El Problema",
  "Cross-border logistics costs companies $2.1T annually in delays and errors":
    "La logistica transfronteriza cuesta a las empresas $2.1T anuales en retrasos y errores",
  "Our Solution": "Nuestra Solucion",
  "One platform to track, translate, and clear shipments in 190 countries":
    "Una plataforma para rastrear, traducir y despachar envios en 190 paises",
};

function getMockScript() {
  return `
    window.Translator = {
      async availability() { return "available"; },
      async create({ targetLanguage }) {
        const map = ${JSON.stringify(MOCK_TRANSLATIONS_ES)};
        return {
          async translate(text) {
            await new Promise(r => setTimeout(r, 80));
            return map[text] || "[" + targetLanguage + "] " + text;
          },
          destroy() {},
        };
      },
    };
    window.LanguageDetector = {
      async create() {
        return {
          async detect() {
            return [{ detectedLanguage: "en", confidence: 0.99 }];
          },
        };
      },
    };
  `;
}

test.use({
  video: {
    mode: "on",
    size: { width: 1280, height: 720 },
  },
  viewport: { width: 1280, height: 720 },
});

test("Demo: dropzone, translate to Spanish, switch slide", async ({ page }) => {
  test.setTimeout(60000);

  await page.addInitScript(getMockScript());

  // Start at the dropzone
  await page.goto("/create");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);

  // Upload
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(fixtures, "acme-pitch-deck.pptx"));
  await page.waitForURL(/\/translate\//, { timeout: 10000 });
  await page.waitForTimeout(1500);

  // Wait for language detection to enable the target combobox, then select Spanish
  const targetInput = page.getByRole("combobox", { name: "Target language" });
  await targetInput.waitFor({ state: "visible", timeout: 10000 });
  // Wait until it's no longer disabled
  await page.waitForFunction(
    () => {
      const input = document.querySelector(
        'input[aria-label="Target language"]',
      ) as HTMLInputElement;
      return input && !input.disabled;
    },
    { timeout: 10000 },
  );
  await targetInput.click();
  await targetInput.fill("Spanish");
  await page.waitForTimeout(150);
  await page.getByRole("option", { name: "Spanish" }).click();
  await page.waitForTimeout(300);

  // Translate
  await page.getByRole("button", { name: "Translate", exact: true }).click();
  await page.waitForTimeout(1500);

  // Click slide 2 thumbnail in the navigator sidebar
  const slide2Thumbnail = page
    .locator("button")
    .filter({ hasText: /2/ })
    .filter({ hasText: /Problem|Problema/ });
  await slide2Thumbnail.click();
  await page.waitForTimeout(1000);

  // Save and convert
  const video = page.video();
  if (video) {
    const webmPath = path.join(screenshotsDir, "demo.webm");
    await video.saveAs(webmPath);

    const mp4Path = path.join(screenshotsDir, "demo.mp4");
    // Trim to the first ~10s of action content and encode
    execSync(
      `ffmpeg -ss 0.3 -t 10.2 -i "${webmPath}" -c:v libx264 -pix_fmt yuv420p -crf 24 -preset slow -movflags +faststart "${mp4Path}" -y 2>/dev/null`,
    );
    execSync(`rm -f "${webmPath}"`);
    console.log(`\nDemo saved: ${mp4Path}`);
  }
});
