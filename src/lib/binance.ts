import crypto from "crypto";
import {
  BinanceAccountResponse,
  BinanceBalance,
  BinanceTrade,
  BinanceTickerPrice,
  BinanceFlexiblePosition,
  BinanceLockedPosition,
  BinanceEarnResponse,
  BinanceAutoInvestTransaction,
  BinanceAutoInvestResponse,
} from "./types";

const BASE_URL = "https://api.binance.com";

function getKeys() {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("BINANCE_API_KEY and BINANCE_API_SECRET must be set");
  }
  return { apiKey, apiSecret };
}

function sign(queryString: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(queryString)
    .digest("hex");
}

export async function signedRequest<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const { apiKey, apiSecret } = getKeys();

  const timestamp = Date.now().toString();
  const searchParams = new URLSearchParams({ ...params, timestamp });
  const queryString = searchParams.toString();
  const signature = sign(queryString, apiSecret);

  const url = `${BASE_URL}${endpoint}?${queryString}&signature=${signature}`;
  const res = await fetch(url, {
    headers: { "X-MBX-APIKEY": apiKey },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function publicRequest<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const searchParams = new URLSearchParams(params);
  const url = `${BASE_URL}${endpoint}?${searchParams.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function getAccountBalances(): Promise<BinanceBalance[]> {
  const account = await signedRequest<BinanceAccountResponse>(
    "/api/v3/account"
  );
  return account.balances.filter((b) => {
    const free = parseFloat(b.free);
    const locked = parseFloat(b.locked);
    return free > 0 || locked > 0;
  });
}

const TRADE_LIMIT = 1000;

export async function getAllTradesForSymbol(
  symbol: string
): Promise<BinanceTrade[]> {
  const allTrades: BinanceTrade[] = [];
  let fromId: number | undefined;

  while (true) {
    const params: Record<string, string> = {
      symbol,
      limit: TRADE_LIMIT.toString(),
    };
    if (fromId !== undefined) {
      params.fromId = fromId.toString();
    }

    const trades = await signedRequest<BinanceTrade[]>(
      "/api/v3/myTrades",
      params
    );

    if (trades.length === 0) break;

    // When using fromId, the first result is the trade with that id (inclusive).
    // Skip it if we already have it from the previous batch.
    if (fromId !== undefined && trades[0].id === fromId) {
      trades.shift();
    }

    if (trades.length === 0) break;

    allTrades.push(...trades);

    if (trades.length < TRADE_LIMIT - 1) break;

    fromId = trades[trades.length - 1].id;
  }

  return allTrades;
}

export async function getEarnBalances(): Promise<BinanceBalance[]> {
  const balanceMap = new Map<string, number>();

  // Fetch all flexible positions (paginated)
  let page = 1;
  while (true) {
    const res = await signedRequest<BinanceEarnResponse<BinanceFlexiblePosition>>(
      "/sapi/v1/simple-earn/flexible/position",
      { current: page.toString(), size: "100" }
    );
    for (const row of res.rows) {
      const amount = parseFloat(row.totalAmount);
      if (amount > 0) {
        balanceMap.set(row.asset, (balanceMap.get(row.asset) || 0) + amount);
      }
    }
    if (page * 100 >= res.total) break;
    page++;
  }

  // Fetch all locked positions (paginated)
  page = 1;
  while (true) {
    const res = await signedRequest<BinanceEarnResponse<BinanceLockedPosition>>(
      "/sapi/v1/simple-earn/locked/position",
      { current: page.toString(), size: "100" }
    );
    for (const row of res.rows) {
      const amount = parseFloat(row.amount);
      if (amount > 0) {
        balanceMap.set(row.asset, (balanceMap.get(row.asset) || 0) + amount);
      }
    }
    if (page * 100 >= res.total) break;
    page++;
  }

  return Array.from(balanceMap.entries()).map(([asset, amount]) => ({
    asset,
    free: amount.toString(),
    locked: "0",
  }));
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function getAutoInvestHistory(): Promise<BinanceAutoInvestTransaction[]> {
  const allTransactions: BinanceAutoInvestTransaction[] = [];
  const now = Date.now();

  // Walk backwards in 30-day windows (API limit) back to Binance launch (Jul 2017)
  let endTime = now;
  const earliest = new Date("2017-07-01").getTime();

  while (endTime > earliest) {
    const startTime = Math.max(endTime - THIRTY_DAYS_MS, earliest);
    let page = 1;

    while (true) {
      const res = await signedRequest<BinanceAutoInvestResponse>(
        "/sapi/v1/lending/auto-invest/history/list",
        {
          startTime: startTime.toString(),
          endTime: endTime.toString(),
          size: "100",
          current: page.toString(),
        }
      );

      if (!res.list || res.list.length === 0) break;

      for (const tx of res.list) {
        if (tx.transactionStatus === "SUCCESS") {
          allTransactions.push(tx);
        }
      }

      if (page * 100 >= res.total) break;
      page++;
    }

    endTime = startTime;
  }

  return allTransactions;
}

export async function getCurrentPrices(
  symbols: string[]
): Promise<BinanceTickerPrice[]> {
  if (symbols.length === 0) return [];

  const formatted = JSON.stringify(symbols);
  return publicRequest<BinanceTickerPrice[]>("/api/v3/ticker/price", {
    symbols: formatted,
  });
}
