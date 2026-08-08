import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateWeaveDocument } from "@shepherd-creative/weave-primitives/schemas";
import tokens from "@shepherd-creative/weave-tokens/tokens.json";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { injectTheme, validateThemeCss } from "../theme.js";
import { computedRootVar, openDocumentPage } from "./view-helpers.js";

const HTML = path.resolve(__dirname, "../../dist/mcp-app.html");
const rawDocument = readFileSync(
  path.resolve(__dirname, "fixtures/dashboard-document.json"),
  "utf8",
);

// Verified locally before committing to this approach: file:// URLs on this
// Chromium build (v1228 / Chrome for Testing 149) preserve query strings
// fine, so no throwaway http server is needed to carry ?document= to the page.

describe("view renders a weave document standalone", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it("fixture is a valid v1 document", () => {
    // Non-vacuity: the fixture every render assertion below depends on must
    // pass the SAME canonical gate the view uses, not a looser one.
    const parsed = validateWeaveDocument(JSON.parse(rawDocument));
    expect(parsed.weave).toBe(1);
    expect(parsed.root.type).toBe("Grid");
  });

  it("renders primitives and consumes token variables", async () => {
    const { page, consoleErrors, pageErrors } = await openDocumentPage(browser, HTML, rawDocument);

    // A schema-invalid document surfaces as a ZodError pageerror with an empty
    // #root — the load-bearing assertion is that NO page errors occurred at
    // all, not just that none mention the harness's parse-failure text.
    expect(pageErrors).toEqual([]);

    // Harness JSON/base64 parse failures render as plain text into #root.
    const rootText = await page.locator("#root").innerText();
    expect(rootText).not.toContain("failed to parse document");
    for (const msg of consoleErrors) {
      expect(msg).not.toContain("failed to parse document");
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
      const { page } = await openDocumentPage(browser, themedPath, rawDocument);
      // The injected :root wins over the base tokens.css default (#09090b),
      // proving cascade order lets the brand theme override the base.
      const bg = await computedRootVar(page, "--background");
      expect(bg).toBe("#ffffff");

      // Contract-v2 variables reach the rendered DOM, not just :root — the
      // brand's --weave-card-padding: 2rem lands as computed 32px padding on
      // a card (located via its title so a layout reshuffle can't repoint it).
      const cardPadding = await page
        .getByText("Revenue by week", { exact: true })
        .evaluate((title) => {
          // title div → <header> → card root div (see ChartCard.tsx).
          const card = title.parentElement?.parentElement;
          return card ? getComputedStyle(card).padding : null;
        });
      expect(cardPadding).toBe("32px");

      // Chart-treatment vars are resolved at render time by resolveFirstVar
      // (recharts props can't carry var() references). Gate on the recharts
      // surface: ResponsiveContainer paints on a later tick than `#root *`.
      await page.waitForSelector("#root .recharts-surface", { timeout: 10_000 });
      const gridStroke = await page.evaluate(
        () =>
          document.querySelector("#root .recharts-cartesian-grid line")?.getAttribute("stroke") ??
          null,
      );
      expect(gridStroke).toBe("#ff0000");

      await page.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
