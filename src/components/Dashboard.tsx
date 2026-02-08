"use client";

import { useState, useEffect, useCallback } from "react";
import { BinanceBalance, BinanceTrade, BinanceTickerPrice, BinanceAutoInvestTransaction, PortfolioData } from "@/lib/types";
import { buildPortfolio } from "@/lib/calculations";
import LoadingSpinner from "./LoadingSpinner";
import ErrorMessage from "./ErrorMessage";
import SummaryCard from "./SummaryCard";
import PortfolioTable from "./PortfolioTable";

type Phase = "idle" | "account" | "earn" | "trades" | "prices" | "done";

const PHASE_MESSAGES: Record<Phase, string> = {
  idle: "",
  account: "Fetching spot balances...",
  earn: "Fetching earn positions...",
  trades: "Fetching trade history...",
  prices: "Fetching current prices...",
  done: "",
};

function mergeBalances(spot: BinanceBalance[], earn: BinanceBalance[]): BinanceBalance[] {
  const map = new Map<string, { free: number; locked: number }>();

  for (const b of spot) {
    const existing = map.get(b.asset) || { free: 0, locked: 0 };
    existing.free += parseFloat(b.free);
    existing.locked += parseFloat(b.locked);
    map.set(b.asset, existing);
  }

  for (const b of earn) {
    const existing = map.get(b.asset) || { free: 0, locked: 0 };
    existing.free += parseFloat(b.free);
    existing.locked += parseFloat(b.locked);
    map.set(b.asset, existing);
  }

  return Array.from(map.entries())
    .filter(([, v]) => v.free > 0 || v.locked > 0)
    .map(([asset, v]) => ({
      asset,
      free: v.free.toString(),
      locked: v.locked.toString(),
    }));
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pnlColor(value: number): string {
  if (value > 0) return "text-green-400";
  if (value < 0) return "text-red-400";
  return "text-zinc-400";
}

export default function Dashboard() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolio = useCallback(async () => {
    try {
      setError(null);
      setPortfolio(null);

      // Step 1: Fetch spot balances
      setPhase("account");
      const balancesRes = await fetch("/api/account");
      if (!balancesRes.ok) {
        const body = await balancesRes.json();
        throw new Error(body.error || "Failed to fetch account");
      }
      const spotBalances: BinanceBalance[] = await balancesRes.json();

      // Step 1b: Fetch earn positions
      setPhase("earn");
      let earnBalances: BinanceBalance[] = [];
      try {
        const earnRes = await fetch("/api/earn");
        if (earnRes.ok) {
          earnBalances = await earnRes.json();
        }
      } catch {
        // Earn fetch is best-effort — continue with spot only
      }

      // Merge spot + earn balances
      const balances = mergeBalances(spotBalances, earnBalances);

      // Filter to assets that might have USDT pairs (exclude USDT and stablecoins)
      const assets = balances.filter(
        (b) => b.asset !== "USDT" && b.asset !== "USDC" && b.asset !== "BUSD"
      );

      if (assets.length === 0) {
        setPortfolio({
          holdings: [],
          totalInvested: 0,
          totalCurrentValue: 0,
          totalPnL: 0,
          totalPnLPercent: 0,
        });
        setPhase("done");
        return;
      }

      // Step 2: Fetch trades + auto-invest history in parallel
      setPhase("trades");
      const symbols = assets.map((b) => `${b.asset}USDT`);

      const [tradeResults, autoInvestTxs] = await Promise.all([
        // Spot trades per symbol
        Promise.allSettled(
          symbols.map(async (symbol) => {
            const res = await fetch(`/api/trades?symbol=${symbol}`);
            if (!res.ok) throw new Error(`Failed for ${symbol}`);
            const trades: BinanceTrade[] = await res.json();
            return { symbol, trades };
          })
        ),
        // Auto-invest history (best-effort)
        fetch("/api/auto-invest")
          .then(async (res) => {
            if (!res.ok) return [];
            return (await res.json()) as BinanceAutoInvestTransaction[];
          })
          .catch(() => [] as BinanceAutoInvestTransaction[]),
      ]);

      const tradesBySymbol: Record<string, BinanceTrade[]> = {};
      const validSymbols: string[] = [];
      for (const result of tradeResults) {
        if (result.status === "fulfilled") {
          tradesBySymbol[result.value.symbol] = result.value.trades;
          validSymbols.push(result.value.symbol);
        }
      }

      // Group auto-invest transactions by target asset
      const autoInvestByAsset: Record<string, BinanceAutoInvestTransaction[]> = {};
      for (const tx of autoInvestTxs) {
        const symbol = `${tx.targetAsset}USDT`;
        if (!validSymbols.includes(symbol)) {
          validSymbols.push(symbol);
        }
        if (!autoInvestByAsset[tx.targetAsset]) {
          autoInvestByAsset[tx.targetAsset] = [];
        }
        autoInvestByAsset[tx.targetAsset].push(tx);
      }

      // Step 3: Fetch current prices
      setPhase("prices");
      if (validSymbols.length === 0) {
        setPortfolio({
          holdings: [],
          totalInvested: 0,
          totalCurrentValue: 0,
          totalPnL: 0,
          totalPnLPercent: 0,
        });
        setPhase("done");
        return;
      }

      const pricesRes = await fetch(
        `/api/prices?symbols=${validSymbols.join(",")}`
      );
      if (!pricesRes.ok) {
        const body = await pricesRes.json();
        throw new Error(body.error || "Failed to fetch prices");
      }
      const prices: BinanceTickerPrice[] = await pricesRes.json();

      // Step 4: Calculate portfolio
      const portfolioData = buildPortfolio(balances, tradesBySymbol, autoInvestByAsset, prices);
      setPortfolio(portfolioData);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setPhase("idle");
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  if (error) {
    return <ErrorMessage message={error} onRetry={fetchPortfolio} />;
  }

  if (phase !== "done" || !portfolio) {
    return <LoadingSpinner message={PHASE_MESSAGES[phase] || "Loading..."} />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Total Invested"
          value={formatUsd(portfolio.totalInvested)}
        />
        <SummaryCard
          label="Current Value"
          value={formatUsd(portfolio.totalCurrentValue)}
        />
        <SummaryCard
          label="Unrealized P&L"
          value={`${portfolio.totalPnL >= 0 ? "+" : ""}${formatUsd(portfolio.totalPnL)}`}
          subValue={`${portfolio.totalPnLPercent >= 0 ? "+" : ""}${portfolio.totalPnLPercent.toFixed(2)}%`}
          valueColor={pnlColor(portfolio.totalPnL)}
        />
      </div>

      {portfolio.holdings.length > 0 ? (
        <PortfolioTable holdings={portfolio.holdings} />
      ) : (
        <p className="py-10 text-center text-zinc-500">
          No holdings found with USDT trading pairs.
        </p>
      )}

      <div className="text-center">
        <button
          onClick={fetchPortfolio}
          className="rounded-md bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
