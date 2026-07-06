import { readFileSync } from "node:fs";
import path from "node:path";
import { SpecSchema } from "@shepherd-creative/weave-primitives/schemas";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HTML = path.resolve(__dirname, "../../dist/mcp-app.html");
const rawSpec = readFileSync(path.resolve(__dirname, "fixtures/dashboard-spec.json"), "utf8");

// Verified locally before committing to this approach: file:// URLs on this
// Chromium build (v1228 / Chrome for Testing 149) preserve query strings
// fine, so no throwaway http server is needed to carry ?spec= to the page.

describe("view renders a weave spec standalone", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it("fixture is a valid spec", () => {
    expect(() => SpecSchema.parse(JSON.parse(rawSpec))).not.toThrow();
  });

  it("renders primitives and consumes token variables", async () => {
    const page: Page = await browser.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const b64 = Buffer.from(rawSpec).toString("base64");
    await page.goto(`file://${HTML}?spec=${encodeURIComponent(b64)}`);
    await page.waitForSelector("#root *", { timeout: 10_000 });

    // Harness parse failures render as plain text into #root — assert none of
    // that text (nor any console/page error) mentions a parse failure.
    const rootText = await page.locator("#root").innerText();
    expect(rootText).not.toContain("failed to parse spec");
    for (const msg of [...consoleErrors, ...pageErrors]) {
      expect(msg).not.toContain("failed to parse spec");
    }

    const revenueVisible = await page.getByText("Revenue").first().isVisible();
    expect(revenueVisible).toBe(true);

    // Other primitives from the fixture actually rendered, not just the KPI.
    const chartTitleVisible = await page.getByText("Revenue by week").first().isVisible();
    expect(chartTitleVisible).toBe(true);
    const tableTitleVisible = await page.getByText("Top accounts").first().isVisible();
    expect(tableTitleVisible).toBe(true);
    const noteVisible = await page.getByText("Context").first().isVisible();
    expect(noteVisible).toBe(true);

    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
    );
    expect(bg).toBe("#09090b");

    await page.close();
  });
});
