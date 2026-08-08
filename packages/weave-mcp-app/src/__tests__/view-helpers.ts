import type { Browser, Page } from "playwright";

// Playwright helpers shared by the view e2e specs. Kept in a non-test module so
// biome's noExportsInTest rule is not tripped by exporting from a *.test.ts file.

export interface DocumentPage {
  page: Page;
  consoleErrors: string[];
  pageErrors: string[];
}

// NOTE for future chart-geometry assertions: gate on
// `page.waitForSelector("#root .recharts-surface")` rather than `#root *` —
// recharts' ResponsiveContainer paints on a later tick, and the race surfaces
// on slow CI.
export async function openDocumentPage(
  browser: Browser,
  htmlPath: string,
  document: string,
): Promise<DocumentPage> {
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  const b64 = Buffer.from(document).toString("base64");
  await page.goto(`file://${htmlPath}?document=${encodeURIComponent(b64)}`);
  await page.waitForSelector("#root *", { timeout: 10_000 });
  return { page, consoleErrors, pageErrors };
}

export function computedRootVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (varName) => getComputedStyle(document.documentElement).getPropertyValue(varName).trim(),
    name,
  );
}
