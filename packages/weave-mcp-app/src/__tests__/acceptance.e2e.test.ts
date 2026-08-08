import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import tokens from "@shepherd-creative/weave-tokens/tokens.json";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { injectTheme, validateThemeCss } from "../theme.js";
import { openDocumentPage } from "./view-helpers.js";

// The spec's headline success criterion, mechanically checked: the SAME
// dashboard spec renders materially differently under default, corporate-light
// and terminal-dense theming, with zero spec changes. Screenshots land in
// dist/acceptance/<name>.png as the human taste check.

const HTML = path.resolve(__dirname, "../../dist/mcp-app.html");
const SHOTS = path.resolve(__dirname, "../../dist/acceptance");
const THEMES_ROOT = path.resolve(__dirname, "../../../../examples/themes");
const KNOWN_VARS = new Set(tokens.variables.map((v) => v.name));

const rawDocument = readFileSync(
  path.resolve(__dirname, "fixtures/dashboard-document.json"),
  "utf8",
);

type ComputedLook = {
  rootBackground: string;
  cardBackground: string;
  cardPadding: string;
  cardFontFamily: string;
  overlineFontFamily: string;
  numericFontFamily: string;
  numericFontFeatureSettings: string;
};

const looks = new Map<string, ComputedLook>();

const CASES: Array<{ name: string; brandDir: string | null }> = [
  { name: "default", brandDir: null },
  { name: "corporate-light", brandDir: path.join(THEMES_ROOT, "corporate-light") },
  { name: "terminal-dense", brandDir: path.join(THEMES_ROOT, "terminal-dense") },
  { name: "brand-iron", brandDir: path.join(THEMES_ROOT, "brand-iron") },
];

describe("multi-theme acceptance: one spec, N looks", () => {
  let browser: Browser;
  let dir: string;

  beforeAll(async () => {
    browser = await chromium.launch();
    dir = mkdtempSync(path.join(tmpdir(), "weave-acceptance-"));
    mkdirSync(SHOTS, { recursive: true });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(CASES)("renders and screenshots $name", async ({ name, brandDir }) => {
    let html = readFileSync(HTML, "utf8");
    if (brandDir) {
      const css = readFileSync(path.join(brandDir, "weave-theme.css"), "utf8");
      const validated = validateThemeCss(css, KNOWN_VARS);
      expect(validated.ok).toBe(true);
      expect(validated.stripped).toEqual([]);
      html = injectTheme(html, validated.css);
    }
    const htmlPath = path.join(dir, `${name}.html`);
    writeFileSync(htmlPath, html);

    const { page, pageErrors } = await openDocumentPage(browser, htmlPath, rawDocument);
    expect(pageErrors).toEqual([]);
    await page.waitForSelector("#root .recharts-surface", { timeout: 10_000 });

    // looks.set below enforces that the combined probes match ComputedLook.
    const look = await page.getByText("Revenue by week", { exact: true }).evaluate((title) => {
      // title div → <header> → card root div (see ChartCard.tsx).
      const card = title.parentElement?.parentElement as HTMLElement;
      const cardStyle = getComputedStyle(card);
      return {
        rootBackground: getComputedStyle(document.documentElement)
          .getPropertyValue("--background")
          .trim(),
        cardBackground: cardStyle.backgroundColor,
        cardPadding: cardStyle.padding,
        cardFontFamily: cardStyle.fontFamily,
      };
    });

    // "MRR" is the TableCard's uppercase column header (role: overline
    // routing, see TableCard.tsx) — probes --weave-font-overline directly.
    const overlineFontFamily = await page
      .getByText("MRR", { exact: true })
      .evaluate((th) => getComputedStyle(th).fontFamily);

    // KPI value: "Revenue" label span → label row div → sibling value div
    // (see KPI.tsx) — probes --weave-font-numeric and
    // --weave-font-feature-numeric on a numeric data display.
    const numeric = await page.getByText("Revenue", { exact: true }).evaluate((label) => {
      const value = label.parentElement?.nextElementSibling as HTMLElement;
      const valueStyle = getComputedStyle(value);
      return {
        numericFontFamily: valueStyle.fontFamily,
        numericFontFeatureSettings: valueStyle.fontFeatureSettings,
      };
    });

    looks.set(name, { ...look, overlineFontFamily, ...numeric });

    // Recharts animates the line draw over ~1.5s; screenshot after it settles
    // or the PNGs show an empty plot area (the assertions above don't care,
    // but the screenshots exist as the human taste check).
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
    await page.close();
  });

  it("the computed looks are pairwise different", () => {
    expect(looks.size).toBe(CASES.length);
    const entries = [...looks.entries()];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [nameA, a] = entries[i] as [string, ComputedLook];
        const [nameB, b] = entries[j] as [string, ComputedLook];
        expect(a, `${nameA} and ${nameB} render identically`).not.toEqual(b);
      }
    }
  });

  it("brand-iron routes overline text to the mono face, unlike default's sans", () => {
    const defaultLook = looks.get("default") as ComputedLook;
    const brandIronLook = looks.get("brand-iron") as ComputedLook;
    expect(brandIronLook.overlineFontFamily).not.toEqual(defaultLook.overlineFontFamily);
    expect(brandIronLook.overlineFontFamily.toLowerCase()).toContain("jetbrains mono");
  });

  it("brand-iron applies oldstyle numeric features and a serif numeric family, unlike default", () => {
    const defaultLook = looks.get("default") as ComputedLook;
    const brandIronLook = looks.get("brand-iron") as ComputedLook;
    // Default computes the token's `normal` default; brand-iron computes its
    // "onum" 1 override (Chromium may serialise the feature without the ` 1`).
    expect(defaultLook.numericFontFeatureSettings).toBe("normal");
    expect(brandIronLook.numericFontFeatureSettings.toLowerCase()).toContain("onum");
    expect(brandIronLook.numericFontFamily).not.toEqual(defaultLook.numericFontFamily);
    expect(brandIronLook.numericFontFamily.toLowerCase()).toContain("fraunces");
  });
});
