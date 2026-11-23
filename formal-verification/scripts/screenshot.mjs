import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outDir = "/workspace/fv-site/screenshots-review";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--font-render-hinting=none", "--disable-font-subpixel-positioning"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  locale: "ja-JP",
  deviceScaleFactor: 2,
});

await page.goto("http://127.0.0.1:4173/#/ch1/2", { waitUntil: "networkidle" });
await page.waitForSelector(".guide h1");
// Wait for the third unit test to appear
await page
  .waitForFunction(
    () => {
      const texts = [...document.querySelectorAll(".ok")].map((n) => n.textContent ?? "");
      return texts.length >= 3;
    },
    { timeout: 5000 },
  )
  .catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, "01-three-tests.png"), fullPage: false });

await page.goto("http://127.0.0.1:4173/#/ch1/5", { waitUntil: "networkidle" });
await page.waitForSelector("#exhaustive");
await page.click("#exhaustive");
await page.waitForFunction(
  () => {
    return (
      document.body.innerText.includes("反例が 1 件") ||
      document.body.innerText.includes("x = −128")
    );
  },
  { timeout: 8000 },
);
await page.waitForTimeout(300);
await page.screenshot({
  path: path.join(outDir, "02-exhaustive-counterexample.png"),
  fullPage: false,
});

await page.goto("http://127.0.0.1:4173/#/ch1/6", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.body.innerText.includes("この入力が、仕様を破る反例"), {
  timeout: 5000,
});
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, "03-counterexample-trace.png"), fullPage: false });

const fonts = await page.evaluate(() => {
  const sample = document.querySelector(".guide h1");
  const style = sample ? getComputedStyle(sample) : null;
  return {
    family: style?.fontFamily,
    title: sample?.textContent,
    japaneseOk: /\u7b2c/.test(document.body.innerText), // 第
  };
});

const overlaps = await page.evaluate(() => {
  const sel = [
    ".topbar",
    ".stage",
    ".rail",
    ".dock",
    ".guide",
    ".widget",
    ".timeline",
    ".pager",
    ".hud",
  ];
  const boxes = sel
    .map((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { s, x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    })
    .filter(Boolean);
  const issues = [];
  const hits = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      // nested pairs are expected
      const nested = [
        [".rail", ".guide"],
        [".rail", ".widget"],
        [".dock", ".timeline"],
        [".dock", ".pager"],
        [".stage", ".hud"],
      ];
      const pair = [a.s, b.s];
      if (
        nested.some(
          ([x, y]) => (pair[0] === x && pair[1] === y) || (pair[0] === y && pair[1] === x),
        )
      )
        continue;
      if (hits(a, b)) issues.push(`${a.s} overlaps ${b.s}`);
    }
  }
  const overflow = [];
  for (const el of document.querySelectorAll(".guide, .stage, .rail, .page, .dock")) {
    if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) {
      overflow.push(
        `${el.className}: scroll ${el.scrollWidth}x${el.scrollHeight} vs ${el.clientWidth}x${el.clientHeight}`,
      );
    }
  }
  return { issues, overflow, boxes };
});

console.log(JSON.stringify({ fonts, overlaps }, null, 2));
await browser.close();
