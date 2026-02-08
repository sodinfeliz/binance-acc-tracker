"use client";

import { useState, useEffect, useCallback } from "react";
import { BinanceBalance, BinanceTrade, BinanceTickerPrice, BinanceAutoInvestTransaction, BinanceAssetDividend, PortfolioData } from "@/lib/types";
import { buildPortfolio } from "@/lib/calculations";
import LoadingSpinner from "./LoadingSpinner";
import ErrorMessage from "./ErrorMessage";
import PortfolioTable from "./PortfolioTable";
import HoldingDetail from "./HoldingDetail";
import Sidebar from "./Sidebar";
import CoinIcon from "./CoinIcon";

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

export default function Dashboard() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [usdtBalance, setUsdtBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [rawTradesBySymbol, setRawTradesBySymbol] = useState<Record<string, BinanceTrade[]>>({});
  const [rawAutoInvestByAsset, setRawAutoInvestByAsset] = useState<Record<string, BinanceAutoInvestTransaction[]>>({});
  const [rawDividendsByAsset, setRawDividendsByAsset] = useState<Record<string, BinanceAssetDividend[]>>({});
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  const fetchPortfolio = useCallback(async () => {
    try {
      setError(null);
      setPortfolio(null);

      setPhase("account");
      const balancesRes = await fetch("/api/account");
      if (!balancesRes.ok) {
        const body = await balancesRes.json();
        throw new Error(body.error || "Failed to fetch account");
      }
      const spotBalances: BinanceBalance[] = await balancesRes.json();

      setPhase("earn");
      let earnBalances: BinanceBalance[] = [];
      try {
        const earnRes = await fetch("/api/earn");
        if (earnRes.ok) {
          earnBalances = await earnRes.json();
        }
      } catch {
        // best-effort
      }

      const balances = mergeBalances(spotBalances, earnBalances);

      // Track USDT balance
      const usdtEntry = balances.find((b) => b.asset === "USDT");
      setUsdtBalance(usdtEntry ? parseFloat(usdtEntry.free) + parseFloat(usdtEntry.locked) : 0);

      const assets = balances.filter(
        (b) => b.asset !== "USDT" && b.asset !== "USDC" && b.asset !== "BUSD"
      );

      if (assets.length === 0) {
        setPortfolio({ holdings: [], totalInvested: 0, totalCurrentValue: 0, totalPnL: 0, totalPnLPercent: 0 });
        setPhase("done");
        return;
      }

      setPhase("trades");
      const symbols = assets.map((b) => `${b.asset}USDT`);

      const [tradeResults, autoInvestTxs, earnRewards] = await Promise.all([
        Promise.allSettled(
          symbols.map(async (symbol) => {
            const res = await fetch(`/api/trades?symbol=${symbol}`);
            if (!res.ok) throw new Error(`Failed for ${symbol}`);
            const trades: BinanceTrade[] = await res.json();
            return { symbol, trades };
          })
        ),
        fetch("/api/auto-invest")
          .then(async (res) => {
            if (!res.ok) return [];
            return (await res.json()) as BinanceAutoInvestTransaction[];
          })
          .catch(() => [] as BinanceAutoInvestTransaction[]),
        fetch("/api/earn-rewards")
          .then(async (res) => {
            if (!res.ok) return [];
            return (await res.json()) as BinanceAssetDividend[];
          })
          .catch(() => [] as BinanceAssetDividend[]),
      ]);

      const tradesBySymbol: Record<string, BinanceTrade[]> = {};
      const validSymbols: string[] = [];
      for (const result of tradeResults) {
        if (result.status === "fulfilled") {
          tradesBySymbol[result.value.symbol] = result.value.trades;
          validSymbols.push(result.value.symbol);
        }
      }

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

      const dividendsByAsset: Record<string, BinanceAssetDividend[]> = {};
      for (const d of earnRewards) {
        if (!dividendsByAsset[d.asset]) {
          dividendsByAsset[d.asset] = [];
        }
        dividendsByAsset[d.asset].push(d);
      }

      setPhase("prices");
      if (validSymbols.length === 0) {
        setPortfolio({ holdings: [], totalInvested: 0, totalCurrentValue: 0, totalPnL: 0, totalPnLPercent: 0 });
        setPhase("done");
        return;
      }

      const pricesRes = await fetch(`/api/prices?symbols=${validSymbols.join(",")}`);
      if (!pricesRes.ok) {
        const body = await pricesRes.json();
        throw new Error(body.error || "Failed to fetch prices");
      }
      const prices: BinanceTickerPrice[] = await pricesRes.json();

      setRawTradesBySymbol(tradesBySymbol);
      setRawAutoInvestByAsset(autoInvestByAsset);
      setRawDividendsByAsset(dividendsByAsset);

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

  const handleSelectHolding = (asset: string) => {
    setSelectedAsset(asset);
  };

  const handleBackToList = () => {
    setSelectedAsset(null);
  };

  const pnlColor = portfolio && portfolio.totalPnL >= 0 ? "text-[#0ecb81]" : "text-[#f6465d]";

  // Main content based on loading state
  let content;
  if (error) {
    content = <ErrorMessage message={error} onRetry={fetchPortfolio} />;
  } else if (phase !== "done" || !portfolio) {
    content = <LoadingSpinner message={PHASE_MESSAGES[phase] || "Loading..."} />;
  } else if (selectedAsset && portfolio) {
    const holding = portfolio.holdings.find((h) => h.asset === selectedAsset);
    if (holding) {
      const trades = rawTradesBySymbol[holding.symbol] || [];
      const autoInvest = rawAutoInvestByAsset[holding.asset] || [];
      const dividends = rawDividendsByAsset[holding.asset] || [];
      content = (
        <HoldingDetail
          holding={holding}
          trades={trades}
          autoInvestTxs={autoInvest}
          dividends={dividends}
          onBack={handleBackToList}
        />
      );
    } else {
      setSelectedAsset(null);
    }
  } else if (activeTab === "overview") {
    // Top 5 holdings for the overview grid
    const topHoldings = portfolio.holdings.slice(0, 5);

    content = (
      <div className="space-y-8">
        {/* Balance header */}
        <div>
          <p className="mb-1 text-sm text-[#848e9c]">Your Estimated Balance</p>
          <span className="text-4xl font-semibold text-white">
            {formatUsd(portfolio.totalCurrentValue)}
          </span>
          <div className="mt-2 flex items-center gap-4">
            <span className={`text-sm ${pnlColor}`}>
              PnL&ensp;
              {portfolio.totalPnL >= 0 ? "+" : ""}
              {formatUsd(portfolio.totalPnL)}
              {" "}({portfolio.totalPnLPercent >= 0 ? "+" : ""}
              {portfolio.totalPnLPercent.toFixed(2)}%)
            </span>
            <span className="text-xs text-[#5e6673]">
              Invested {formatUsd(portfolio.totalInvested)}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl bg-[#1e2329] p-5">
            <p className="text-xs text-[#848e9c]">Total Assets</p>
            <p className="mt-1 text-xl font-semibold text-white">{portfolio.holdings.length}</p>
          </div>
          <div className="rounded-xl bg-[#1e2329] p-5">
            <p className="text-xs text-[#848e9c]">Total Invested</p>
            <p className="mt-1 text-xl font-semibold text-white">{formatUsd(portfolio.totalInvested)}</p>
          </div>
          <div className="rounded-xl bg-[#1e2329] p-5">
            <p className="text-xs text-[#848e9c]">Unrealized PNL</p>
            <p className={`mt-1 text-xl font-semibold ${pnlColor}`}>
              {portfolio.totalPnL >= 0 ? "+" : ""}{formatUsd(portfolio.totalPnL)}
            </p>
          </div>
          <div className="rounded-xl bg-[#1e2329] p-5">
            <p className="text-xs text-[#848e9c]">USDT Balance</p>
            <p className="mt-1 text-xl font-semibold text-white">{formatUsd(usdtBalance)}</p>
          </div>
        </div>

        {/* Top holdings card */}
        <div className="rounded-xl bg-[#1e2329]">
          <div className="flex items-center justify-between px-6 py-4">
            <span className="text-sm font-medium text-white">Top Holdings</span>
            <button
              onClick={() => setActiveTab("holdings")}
              className="text-xs text-[#f0b90b] transition-colors hover:text-[#fcd535]"
            >
              View All &gt;
            </button>
          </div>
          <div>
            {topHoldings.map((h, i) => (
              <div
                key={h.asset}
                onClick={() => handleSelectHolding(h.asset)}
                className={`flex cursor-pointer items-center justify-between px-6 py-3.5 transition-colors hover:bg-[#2b3139] ${
                  i < topHoldings.length - 1 ? "border-b border-[#2b3139]" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <CoinIcon asset={h.asset} size={36} />
                  <div>
                    <span className="font-medium text-white">{h.asset}</span>
                    <p className="text-xs text-[#5e6673]">{formatUsd(h.currentPrice)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-white">{formatUsd(h.currentValue)}</p>
                  <p className={`text-xs ${h.pnlPercent >= 0 ? "text-[#0ecb81]" : "text-[#f6465d]"}`}>
                    {h.pnlPercent >= 0 ? "+" : ""}{h.pnlPercent.toFixed(2)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <button
            onClick={fetchPortfolio}
            className="rounded-md bg-[#fcd535] px-5 py-2 text-sm font-medium text-[#202630] transition-colors hover:bg-[#f0b90b]"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  } else {
    // Holdings tab
    content = (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">All Holdings</h2>
            <p className="text-xs text-[#848e9c]">
              {portfolio.holdings.length} asset{portfolio.holdings.length !== 1 ? "s" : ""} &middot; Total value {formatUsd(portfolio.totalCurrentValue)}
            </p>
          </div>
          <button
            onClick={fetchPortfolio}
            className="rounded-md bg-[#fcd535] px-5 py-2 text-sm font-medium text-[#202630] transition-colors hover:bg-[#f0b90b]"
          >
            Refresh
          </button>
        </div>

        {portfolio.holdings.length > 0 ? (
          <PortfolioTable holdings={portfolio.holdings} onSelectHolding={handleSelectHolding} />
        ) : (
          <p className="py-10 text-center text-sm text-[#848e9c]">
            No holdings found with USDT trading pairs.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="ml-60 flex-1 px-8 py-8">
        {content}
      </main>
    </div>
  );
}
