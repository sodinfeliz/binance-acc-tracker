"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BinanceBalance, BinanceTrade, BinanceTickerPrice, BinanceAutoInvestTransaction, BinanceAssetDividend, PortfolioData } from "@/lib/types";
import { buildPortfolio } from "@/lib/calculations";
import dynamic from "next/dynamic";
import LoadingSpinner from "./LoadingSpinner";
import ErrorMessage from "./ErrorMessage";
import PortfolioTable from "./PortfolioTable";
import HoldingDetail from "./HoldingDetail";
import TopBar from "./TopBar";
import CoinIcon from "./CoinIcon";

const DcaAnalysis = dynamic(() => import("./DcaAnalysis"), { ssr: false });
const DcaDetail = dynamic(() => import("./DcaDetail"), { ssr: false });

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
  const [selectedDcaAsset, setSelectedDcaAsset] = useState<string | null>(null);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<number | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Cached data for price-only refresh
  const cachedBalances = useRef<BinanceBalance[]>([]);
  const cachedTradesBySymbol = useRef<Record<string, BinanceTrade[]>>({});
  const cachedAutoInvestByAsset = useRef<Record<string, BinanceAutoInvestTransaction[]>>({});
  const cachedValidSymbols = useRef<string[]>([]);

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

      cachedBalances.current = balances;
      cachedTradesBySymbol.current = tradesBySymbol;
      cachedAutoInvestByAsset.current = autoInvestByAsset;
      cachedValidSymbols.current = validSymbols;

      setRawTradesBySymbol(tradesBySymbol);
      setRawAutoInvestByAsset(autoInvestByAsset);
      setRawDividendsByAsset(dividendsByAsset);

      const portfolioData = buildPortfolio(balances, tradesBySymbol, autoInvestByAsset, prices);
      setPortfolio(portfolioData);
      setLastPriceUpdate(Date.now());
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setPhase("idle");
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  // Lightweight price-only refresh
  const refreshPrices = useCallback(async () => {
    const symbols = cachedValidSymbols.current;
    if (symbols.length === 0 || phase !== "done") return;

    try {
      const res = await fetch(`/api/prices?symbols=${symbols.join(",")}`);
      if (!res.ok) return;
      const prices: BinanceTickerPrice[] = await res.json();

      const portfolioData = buildPortfolio(
        cachedBalances.current,
        cachedTradesBySymbol.current,
        cachedAutoInvestByAsset.current,
        prices
      );
      setPortfolio(portfolioData);
      setLastPriceUpdate(Date.now());
    } catch {
      // silent fail for auto-refresh
    }
  }, [phase]);

  // Auto-refresh prices every 60s
  useEffect(() => {
    if (phase !== "done") return;
    const interval = setInterval(refreshPrices, 60_000);
    return () => clearInterval(interval);
  }, [phase, refreshPrices]);

  // Tick the "seconds ago" counter
  useEffect(() => {
    if (!lastPriceUpdate) return;
    setSecondsAgo(0);
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastPriceUpdate) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastPriceUpdate]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setSelectedAsset(null);
    setSelectedDcaAsset(null);
  }, []);

  // Terminal keyboard shortcuts: 1/2/3 switch tabs, R refreshes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (e.key === "1") handleTabChange("overview");
      else if (e.key === "2") handleTabChange("holdings");
      else if (e.key === "3") handleTabChange("dca");
      else if (e.key === "r" || e.key === "R") fetchPortfolio();
      else if (e.key === "Escape") {
        setSelectedAsset(null);
        setSelectedDcaAsset(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleTabChange, fetchPortfolio]);

  const handleSelectHolding = (asset: string) => {
    setSelectedAsset(asset);
  };

  const handleBackToList = () => {
    setSelectedAsset(null);
  };

  const pnlColor = portfolio && portfolio.totalPnL >= 0 ? "text-up" : "text-down";

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
  } else if (activeTab === "dca" && selectedDcaAsset && portfolio) {
    const holding = portfolio.holdings.find((h) => h.asset === selectedDcaAsset);
    if (holding) {
      const trades = rawTradesBySymbol[holding.symbol] || [];
      const autoInvest = rawAutoInvestByAsset[holding.asset] || [];
      const dividends = rawDividendsByAsset[holding.asset] || [];
      content = (
        <DcaDetail
          holding={holding}
          trades={trades}
          autoInvestTxs={autoInvest}
          dividends={dividends}
          onBack={() => setSelectedDcaAsset(null)}
        />
      );
    } else {
      setSelectedDcaAsset(null);
    }
  } else if (activeTab === "dca") {
    content = (
      <DcaAnalysis
        portfolio={portfolio}
        rawTradesBySymbol={rawTradesBySymbol}
        rawAutoInvestByAsset={rawAutoInvestByAsset}
        rawDividendsByAsset={rawDividendsByAsset}
        onSelectAsset={setSelectedDcaAsset}
      />
    );
  } else if (activeTab === "overview") {
    // Top 5 holdings for the overview grid
    const topHoldings = portfolio.holdings.slice(0, 5);

    content = (
      <div className="space-y-3">
        {/* Tiled summary grid */}
        <div className="grid grid-cols-12 gap-px border border-grid bg-grid">
          {/* Balance readout */}
          <div className="col-span-12 bg-panel p-4 lg:col-span-4">
            <p className="text-[11px] tracking-[0.2em] text-amber">EST. BALANCE · USD</p>
            <p className="mt-2 text-4xl font-bold tracking-tight text-ink">
              {portfolio.totalCurrentValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className={`mt-2 text-[13px] ${pnlColor}`}>
              {portfolio.totalPnL >= 0 ? "▲ +" : "▼ "}
              {formatUsd(portfolio.totalPnL)} ({portfolio.totalPnLPercent >= 0 ? "+" : ""}
              {portfolio.totalPnLPercent.toFixed(2)}%)
            </p>
          </div>
          {/* Stat cells */}
          <div className="col-span-6 bg-panel p-4 lg:col-span-2">
            <p className="text-[11px] tracking-[0.2em] text-ink-3">ASSETS</p>
            <p className="mt-2 text-xl text-ink">{portfolio.holdings.length}</p>
          </div>
          <div className="col-span-6 bg-panel p-4 lg:col-span-2">
            <p className="text-[11px] tracking-[0.2em] text-ink-3">INVESTED</p>
            <p className="mt-2 text-xl text-ink">{formatUsd(portfolio.totalInvested)}</p>
          </div>
          <div className="col-span-6 bg-panel p-4 lg:col-span-2">
            <p className="text-[11px] tracking-[0.2em] text-ink-3">UNRLZD PNL</p>
            <p className={`mt-2 text-xl ${pnlColor}`}>
              {portfolio.totalPnL >= 0 ? "+" : ""}{formatUsd(portfolio.totalPnL)}
            </p>
          </div>
          <div className="col-span-6 bg-panel p-4 lg:col-span-2">
            <p className="text-[11px] tracking-[0.2em] text-ink-3">USDT FREE</p>
            <p className="mt-2 text-xl text-ink">{formatUsd(usdtBalance)}</p>
          </div>
        </div>

        {/* Top positions panel */}
        <div className="panel">
          <div className="panel-title">
            <span>Top Positions</span>
            <button
              onClick={() => setActiveTab("holdings")}
              className="tracking-[0.15em] text-ink-2 transition-colors hover:text-amber"
            >
              [VIEW ALL]
            </button>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-grid text-left text-[11px] tracking-[0.15em] text-ink-3">
                <th className="px-3 py-2 font-normal">#</th>
                <th className="px-3 py-2 font-normal">SYM</th>
                <th className="px-3 py-2 text-right font-normal">PRICE</th>
                <th className="px-3 py-2 text-right font-normal">VALUE</th>
                <th className="px-3 py-2 text-right font-normal">PNL%</th>
              </tr>
            </thead>
            <tbody>
              {topHoldings.map((h, i) => (
                <tr
                  key={h.asset}
                  onClick={() => handleSelectHolding(h.asset)}
                  className={`cursor-pointer transition-colors hover:bg-panel-2 ${
                    i < topHoldings.length - 1 ? "border-b border-grid/60" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 text-ink-3">{String(i + 1).padStart(2, "0")}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <CoinIcon asset={h.asset} size={20} />
                      <span className="font-bold text-ink">{h.asset}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{formatUsd(h.currentPrice)}</td>
                  <td className="px-3 py-2.5 text-right text-ink">{formatUsd(h.currentValue)}</td>
                  <td className={`px-3 py-2.5 text-right ${h.pnlPercent >= 0 ? "text-up" : "text-down"}`}>
                    {h.pnlPercent >= 0 ? "+" : ""}{h.pnlPercent.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  } else {
    // Holdings tab
    content = (
      <div className="panel">
        <div className="panel-title">
          <span>
            Positions <span className="text-ink-3">/ {portfolio.holdings.length} ASSETS / {formatUsd(portfolio.totalCurrentValue)}</span>
          </span>
        </div>
        {portfolio.holdings.length > 0 ? (
          <PortfolioTable holdings={portfolio.holdings} onSelectHolding={handleSelectHolding} />
        ) : (
          <p className="px-3 py-10 text-center text-[13px] text-ink-2">
            NO HOLDINGS FOUND WITH USDT TRADING PAIRS.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        live={phase === "done"}
        secondsAgo={lastPriceUpdate ? secondsAgo : null}
        onRefresh={fetchPortfolio}
      />
      <main className="flex-1 px-4 py-4 pb-12">
        <div className="mx-auto max-w-7xl">{content}</div>
      </main>

      {/* Bottom status bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 flex h-7 items-center gap-4 border-t border-grid bg-panel px-4 text-[11px] tracking-[0.1em] text-ink-3">
        <span className="text-amber">SRC: SPOT + EARN + AUTO-INVEST</span>
        <span>│</span>
        <span>PAIRS: USDT</span>
        <span>│</span>
        <span>AUTO-REFRESH: 60S</span>
        <span className="ml-auto hidden sm:inline">KEYS: [1][2][3] NAV · [R] REFRESH</span>
      </footer>
    </div>
  );
}
