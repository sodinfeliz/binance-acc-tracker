import { chromium } from "playwright";
import sharp from "sharp";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, unlink } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", ".github", "screenshots");

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 900 };

// ═══════════════════════════════════════════════════════════
// Mock data — every /api/* request is intercepted in the
// browser, so no real Binance account data ever appears.
// Fictional portfolio: BTC + ETH + top-20 alts, no stablecoins.
// ═══════════════════════════════════════════════════════════

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const NOW = Date.UTC(2026, 6, 28, 12, 0, 0);
const DAY = 86_400_000;

// Fictional "current" prices
const PRICES = {
  BTC: 63500, ETH: 1890, SOL: 73.4, BNB: 568, XRP: 1.05, DOGE: 0.082,
  ADA: 0.158, LINK: 8.34, AVAX: 6.49, TRX: 0.33, DOT: 2.85,
};

// Fictional positions: qty of spot buys, target avg cost, buy count,
// optional monthly auto-invest txs and earn reward distributions
const POSITIONS = [
  { asset: "BTC", qty: 0.52, avg: 45200, buys: 9, autoInvest: 12 },
  { asset: "ETH", qty: 6.2, avg: 2150, buys: 14, rewards: 40 },
  { asset: "SOL", qty: 85, avg: 96, buys: 7 },
  { asset: "BNB", qty: 12.5, avg: 415, buys: 5 },
  { asset: "XRP", qty: 3200, avg: 0.58, buys: 6 },
  { asset: "DOGE", qty: 24000, avg: 0.105, buys: 5 },
  { asset: "ADA", qty: 7500, avg: 0.42, buys: 18, autoInvest: 10, rewards: 25 },
  { asset: "LINK", qty: 310, avg: 13.1, buys: 6 },
  { asset: "AVAX", qty: 140, avg: 21.5, buys: 5 },
  { asset: "TRX", qty: 4100, avg: 0.21, buys: 4, rewards: 30 },
  { asset: "DOT", qty: 380, avg: 5.9, buys: 5 },
];

let nextId = 1000;

function buildMockData() {
  const tradesBySymbol = {};
  const autoInvest = [];
  const rewards = [];
  const balances = [{ asset: "USDT", free: "2480.55", locked: "0" }];

  for (const pos of POSITIONS) {
    const rng = mulberry32(hashCode(pos.asset));
    const symbol = `${pos.asset}USDT`;
    let totalQty = 0;

    // Spot buys spread over the last ~24 months
    const trades = [];
    const weights = Array.from({ length: pos.buys }, () => 0.4 + rng());
    const weightSum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pos.buys; i++) {
      const qty = (pos.qty * weights[i]) / weightSum;
      const price = pos.avg * (0.72 + rng() * 0.56); // ±28% around avg
      const quoteQty = qty * price;
      const time = NOW - Math.floor((5 + rng() * 720) * DAY);
      trades.push({
        id: nextId++,
        symbol,
        orderId: nextId++,
        price: price.toFixed(8),
        qty: qty.toFixed(8),
        quoteQty: quoteQty.toFixed(8),
        commission: (quoteQty * 0.001).toFixed(8),
        commissionAsset: "USDT",
        time,
        isBuyer: true,
        isMaker: rng() > 0.5,
        isBestMatch: true,
      });
      totalQty += qty;
    }
    trades.sort((a, b) => a.time - b.time);
    tradesBySymbol[symbol] = trades;

    // Monthly $100 auto-invest plan
    for (let i = 0; i < (pos.autoInvest ?? 0); i++) {
      const time = NOW - (i + 1) * 30 * DAY;
      const price = pos.avg * (0.8 + rng() * 0.4);
      const target = 100 / price;
      autoInvest.push({
        id: nextId++,
        targetAsset: pos.asset,
        planType: "SINGLE",
        sourceAsset: "USDT",
        sourceAssetAmount: "100",
        targetAssetAmount: target.toFixed(8),
        transactionDateTime: time,
        transactionStatus: "SUCCESS",
        transactionFee: "0.05",
        transactionFeeUnit: "USDT",
        executionPrice: price.toFixed(8),
      });
      totalQty += target;
    }

    // Earn reward distributions (small daily interest payouts)
    for (let i = 0; i < (pos.rewards ?? 0); i++) {
      const amount = (pos.qty * (0.00003 + rng() * 0.00005)).toFixed(8);
      rewards.push({
        id: nextId++,
        amount,
        asset: pos.asset,
        divTime: NOW - (i + 1) * DAY,
        enInfo: "Simple Earn Flexible Interest",
        tranId: nextId++,
      });
      totalQty += parseFloat(amount);
    }

    balances.push({ asset: pos.asset, free: totalQty.toString(), locked: "0" });
  }

  return { balances, tradesBySymbol, autoInvest, rewards };
}

const MOCK = buildMockData();

const INTERVAL_SEC = { "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800 };

// Random-walk kline series that always ends at the asset's current price
function mockKlines(params) {
  const symbol = params.get("symbol") ?? "";
  const interval = params.get("interval") ?? "1d";
  const limit = Math.min(parseInt(params.get("limit") ?? "90", 10), 1000);
  const asset = symbol.replace(/USDT$/, "");
  const current = PRICES[asset] ?? 100;

  const step = INTERVAL_SEC[interval] ?? 86400;
  const vol = 0.028 * Math.sqrt(step / 86400);
  const rng = mulberry32(hashCode(symbol + interval));

  const walk = [1];
  for (let i = 1; i < limit; i++) {
    walk.push(walk[i - 1] * (1 + (rng() - 0.49) * vol * 2));
  }
  const last = walk[walk.length - 1];
  const endSec = Math.floor(NOW / 1000);
  return walk.map((w, i) => ({
    time: endSec - (limit - 1 - i) * step,
    value: (w / last) * current,
  }));
}

async function mockApiRoutes(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body = [];

    if (path === "/api/account") body = MOCK.balances;
    else if (path === "/api/earn") body = [];
    else if (path === "/api/trades") body = MOCK.tradesBySymbol[url.searchParams.get("symbol")] ?? [];
    else if (path === "/api/auto-invest") body = MOCK.autoInvest;
    else if (path === "/api/earn-rewards") body = MOCK.rewards;
    else if (path === "/api/prices") {
      const symbols = (url.searchParams.get("symbols") ?? "").split(",");
      body = symbols
        .map((s) => ({ symbol: s, price: PRICES[s.replace(/USDT$/, "")] }))
        .filter((p) => p.price !== undefined)
        .map((p) => ({ symbol: p.symbol, price: p.price.toString() }));
    } else if (path === "/api/klines") body = mockKlines(url.searchParams);

    await route.fulfill({ json: body });
  });
}

// ═══════════════════════════════════════════════════════════
// Prettify: gradient bg + rounded corners + shadow
// ═══════════════════════════════════════════════════════════

async function prettify(inputBuf, outputPath, { pad = 48, radius = 12 } = {}) {
  const { width, height } = await sharp(inputBuf).metadata();

  const canvasW = width + pad * 2;
  const canvasH = height + pad * 2;

  const roundedMask = Buffer.from(
    `<svg width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`
  );

  const roundedImg = await sharp(inputBuf)
    .composite([{ input: roundedMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  const shadowLayer = await sharp(
    Buffer.from(
      `<svg width="${canvasW}" height="${canvasH}">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="25"/>
          </filter>
        </defs>
        <rect x="${pad + 6}" y="${pad + 6}" width="${width}" height="${height}"
              rx="${radius}" ry="${radius}" fill="rgba(0,0,0,0.5)" filter="url(#shadow)"/>
      </svg>`
    )
  ).png().toBuffer();

  const bg = Buffer.from(
    `<svg width="${canvasW}" height="${canvasH}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#07090c"/>
          <stop offset="50%" stop-color="#191307"/>
          <stop offset="100%" stop-color="#07090c"/>
        </linearGradient>
      </defs>
      <rect width="${canvasW}" height="${canvasH}" fill="url(#bg)"/>
    </svg>`
  );

  await sharp(bg)
    .composite([
      { input: shadowLayer, top: 0, left: 0 },
      { input: roundedImg, top: pad, left: pad },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

// ═══════════════════════════════════════════════════════════
// Captures
// ═══════════════════════════════════════════════════════════

async function captureViewport(page, name) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const buf = await page.screenshot();
  await prettify(buf, resolve(OUT_DIR, `${name}.png`));
  console.log(`  ✓ ${name}`);
}

async function captureElement(page, locator, name) {
  await page.mouse.move(0, 0);
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const buf = await locator.screenshot();
  await prettify(buf, resolve(OUT_DIR, `${name}.png`), { pad: 36 });
  console.log(`  ✓ ${name}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const f of await readdir(OUT_DIR).catch(() => [])) {
    if (f.endsWith(".png")) await unlink(resolve(OUT_DIR, f));
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await mockApiRoutes(page);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=EST. BALANCE", { timeout: 30_000 });
  await page.waitForTimeout(1500); // let coin icons settle

  console.log("\nCapturing:");

  // [1] Overview — fit the viewport to the content so the shot has no dead space
  {
    const contentHeight = await page.evaluate(() => {
      const bottoms = [...document.querySelectorAll("main *")].map(
        (el) => el.getBoundingClientRect().bottom
      );
      return Math.ceil(Math.max(...bottoms) + 16 + 28); // main padding + status bar
    });
    await page.setViewportSize({ width: VIEWPORT.width, height: contentHeight });
    await page.waitForTimeout(400);
    await captureViewport(page, "overview");
    await page.setViewportSize(VIEWPORT);
    await page.waitForTimeout(400);
  }

  // [2] Holdings — just the positions panel
  await page.keyboard.press("2");
  await page.waitForTimeout(600);
  await captureElement(page, page.locator(".panel", { hasText: "POSITIONS" }).first(), "holdings");

  // Holding detail (BTC) with avg-buy line and trade markers on
  await page.locator("tr", { hasText: "BTC" }).first().click();
  await page.waitForTimeout(2000);
  await page.locator('label:has-text("AVG BUY") input').check();
  await page.locator('label:has-text("TRADES") input').check();
  await page.waitForTimeout(800);
  await captureViewport(page, "holding-detail");

  // [3] DCA analysis — blur the checkbox first so keyboard shortcuts register
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press("Escape");
  await page.keyboard.press("3");
  await page.waitForTimeout(600);
  await captureElement(page, page.locator(".panel", { hasText: "DCA ANALYSIS" }).first(), "dca");

  // DCA detail (ADA) — just the cost basis chart panel
  await page.locator("tr", { hasText: "ADA" }).first().click();
  await page.waitForTimeout(2000);
  await captureElement(page, page.locator(".panel", { hasText: "COST BASIS OVER TIME" }).first(), "dca-detail");

  await browser.close();
  console.log(`\nDone! Screenshots saved to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
