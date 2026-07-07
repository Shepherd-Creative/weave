import type { Browser, Page } from "playwright";

// Playwright helpers shared by the view e2e specs. Kept in a non-test module so
// biome's noExportsInTest rule is not tripped by exporting from a *.test.ts file.

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
