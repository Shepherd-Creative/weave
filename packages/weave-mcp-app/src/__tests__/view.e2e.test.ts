import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SpecSchema } from "@shepherd-creative/weave-primitives/schemas";
import tokens from "@shepherd-creative/weave-tokens/tokens.json";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { injectTheme, validateThemeCss } from "../theme.js";

const HTML = path.resolve(__dirname, "../../dist/mcp-app.html");
const rawSpec = readFileSync(path.resolve(__dirname, "fixtures/dashboard-spec.json"), "utf8");

// Verified locally before committing to this approach: file:// URLs on this
// Chromium build (v1228 / Chrome for Testing 149) preserve query strings
// fine, so no throwaway http server is needed to carry ?spec= to the page.

export interface SpecPage {
  page: Page;
  consoleErrors: string[];
  pageErrors: string[];
}

// NOTE for future chart-geometry assertions: gate on
// `page.waitForSelector("#root .recharts-surface")` rather than `#root *` —
// recharts' ResponsiveContainer paints on a later tick, and the race surfaces
// on slow CI.
export async function openSpecPage(
  browser: Browser,
  htmlPath: string,
  spec: string,
): Promise<SpecPage> {
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  const b64 = Buffer.from(spec).toString("base64");
  await page.goto(`file://${htmlPath}?spec=${encodeURIComponent(b64)}`);
  await page.waitForSelector("#root *", { timeout: 10_000 });
  return { page, consoleErrors, pageErrors };
}

export function computedRootVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (varName) => getComputedStyle(document.documentElement).getPropertyValue(varName).trim(),
    name,
  );
}

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
    const { page, consoleErrors, pageErrors } = await openSpecPage(browser, HTML, rawSpec);

    // A schema-invalid spec surfaces as a ZodError pageerror with an empty
    // #root — the load-bearing assertion is that NO page errors occurred at
    // all, not just that none mention the harness's parse-failure text.
    expect(pageErrors).toEqual([]);

    // Harness JSON/base64 parse failures render as plain text into #root.
    const rootText = await page.locator("#root").innerText();
    expect(rootText).not.toContain("failed to parse spec");
    for (const msg of consoleErrors) {
      expect(msg).not.toContain("failed to parse spec");
    }

    // Exact match so a fixture reorder can't silently repoint this at the
    // "Revenue by week" chart title (verified: matches exactly 1 element).
    const revenueVisible = await page.getByText("Revenue", { exact: true }).isVisible();
    expect(revenueVisible).toBe(true);

    // Other primitives from the fixture actually rendered, not just the KPI.
    const chartTitleVisible = await page.getByText("Revenue by week", { exact: true }).isVisible();
    expect(chartTitleVisible).toBe(true);
    const tableTitleVisible = await page.getByText("Top accounts", { exact: true }).isVisible();
    expect(tableTitleVisible).toBe(true);
    const noteVisible = await page.getByText("Context", { exact: true }).isVisible();
    expect(noteVisible).toBe(true);

    // Recharts survived the singlefile bundle and painted an SVG surface —
    // the highest-risk thing this proof exists to de-risk. ResponsiveContainer
    // paints on a later tick than `#root *`, so gate on its own selector.
    await page.waitForSelector("#root .recharts-surface", { timeout: 10_000 });
    expect(await page.locator("#root .recharts-surface").count()).toBeGreaterThan(0);

    const bg = await computedRootVar(page, "--background");
    expect(bg).toBe("#09090b");

    await page.close();
  });

  it("brand theme injected into the placeholder wins the cascade over base tokens", async () => {
    const knownVars = new Set(tokens.variables.map((v) => v.name));
    const brandCss = readFileSync(
      path.resolve(__dirname, "fixtures/brand/weave-theme.css"),
      "utf8",
    );
    const validated = validateThemeCss(brandCss, knownVars);
    expect(validated.ok).toBe(true);

    const themedHtml = injectTheme(readFileSync(HTML, "utf8"), validated.css);
    const dir = mkdtempSync(path.join(tmpdir(), "weave-themed-view-"));
    const themedPath = path.join(dir, "mcp-app.html");
    writeFileSync(themedPath, themedHtml);

    try {
      const { page } = await openSpecPage(browser, themedPath, rawSpec);
      // The injected :root wins over the base tokens.css default (#09090b),
      // proving cascade order lets the brand theme override the base.
      const bg = await computedRootVar(page, "--background");
      expect(bg).toBe("#ffffff");
      await page.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
