"use client";

import { useMemo, useEffect, useRef } from "react";
import { createChart, LineSeries, ColorType, LineStyle } from "lightweight-charts";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import { CryptoHolding, BinanceTrade, BinanceAutoInvestTransaction, BinanceAssetDividend } from "@/lib/types";
import { unifyTransactions, computeDcaTimeline } from "@/lib/calculations";
import CoinIcon from "./CoinIcon";

interface DcaDetailProps {
  holding: CryptoHolding;
  trades: BinanceTrade[];
  autoInvestTxs: BinanceAutoInvestTransaction[];
  dividends: BinanceAssetDividend[];
  onBack: () => void;
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQty(value: number): string {
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.001) return value.toFixed(6);
  return value.toFixed(8);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPricePrecision(minPrice: number): number {
  if (minPrice >= 100) return 2;
  if (minPrice >= 1) return 4;
  if (minPrice >= 0.01) return 6;
  return 8;
}

export default function DcaDetail({ holding, trades, autoInvestTxs, dividends, onBack }: DcaDetailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const transactions = useMemo(
    () => unifyTransactions(holding.asset, holding.symbol, trades, autoInvestTxs, dividends),
    [holding.asset, holding.symbol, trades, autoInvestTxs, dividends]
  );

  const timeline = useMemo(() => computeDcaTimeline(transactions), [transactions]);

  const spotBuys = useMemo(
    () =>
      transactions
        .filter((tx) => tx.source === "spot" && tx.type === "buy")
        .sort((a, b) => b.date - a.date),
    [transactions]
  );

  // Map each spot buy (newest-first) to its running avg cost from the timeline (oldest-first)
  const costBasisByIndex = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < timeline.length; i++) {
      // timeline[i] corresponds to spotBuys[spotBuys.length - 1 - i]
      map.set(spotBuys.length - 1 - i, timeline[i].avgCost);
    }
    return map;
  }, [timeline, spotBuys.length]);

  const stats = useMemo(() => {
    if (timeline.length === 0) return null;
    const last = timeline[timeline.length - 1];
    const prices = spotBuys.map((tx) => tx.price);
    return {
      numBuys: timeline.length,
      totalInvested: last.totalInvested,
      totalQty: last.totalQty,
      avgCost: last.avgCost,
      firstBuyDate: timeline[0].date,
      lastBuyDate: timeline[timeline.length - 1].date,
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
    };
  }, [timeline, spotBuys]);

  // Chart
  useEffect(() => {
    if (!containerRef.current || timeline.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#1e2329" },
        textColor: "#848e9c",
      },
      grid: {
        vertLines: { color: "#2b3139" },
        horzLines: { color: "#2b3139" },
      },
      crosshair: {
        vertLine: { color: "#f0b90b", width: 1, style: 2, labelBackgroundColor: "#f0b90b" },
        horzLine: { color: "#f0b90b", width: 1, style: 2, labelBackgroundColor: "#f0b90b" },
      },
      timeScale: {
        borderColor: "#2b3139",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#2b3139",
      },
      handleScroll: { vertTouchDrag: false },
    });

    const minPrice = Math.min(...timeline.map((d) => d.avgCost));
    const precision = getPricePrecision(minPrice);

    const avgCostSeries = chart.addSeries(LineSeries, {
      color: "#f0b90b",
      lineWidth: 2,
      priceFormat: { type: "price", precision, minMove: 1 / Math.pow(10, precision) },
    });

    // Deduplicate: multiple buys can share the same second; keep the last (most accumulated) entry per timestamp
    const deduped = new Map<number, { time: UTCTimestamp; value: number }>();
    for (const d of timeline) {
      const t = Math.floor(d.date / 1000) as UTCTimestamp;
      deduped.set(t as number, { time: t, value: d.avgCost });
    }
    const chartData = Array.from(deduped.values()).sort((a, b) => (a.time as number) - (b.time as number));

    avgCostSeries.setData(chartData);

    // Current price reference line
    const priceInProfit = holding.currentPrice >= (stats?.avgCost ?? 0);
    avgCostSeries.createPriceLine({
      price: holding.currentPrice,
      color: priceInProfit ? "#0ecb81" : "#f6465d",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Current",
    });

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [timeline, holding.currentPrice, stats?.avgCost]);

  if (!stats) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2b3139] text-[#848e9c] transition-colors hover:bg-[#3b4149] hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <CoinIcon asset={holding.asset} size={40} />
          <h2 className="text-2xl font-semibold text-white">{holding.asset}</h2>
        </div>
        <p className="py-10 text-center text-sm text-[#848e9c]">No spot buy transactions found for this asset.</p>
      </div>
    );
  }

  const pnlPercent = stats.avgCost > 0
    ? ((holding.currentPrice - stats.avgCost) / stats.avgCost) * 100
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2b3139] text-[#848e9c] transition-colors hover:bg-[#3b4149] hover:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <CoinIcon asset={holding.asset} size={40} />
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold text-white">{holding.asset}</h2>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${pnlPercent >= 0 ? "bg-[#0ecb81]/15 text-[#0ecb81]" : "bg-[#f6465d]/15 text-[#f6465d]"}`}>
              {pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%
            </span>
          </div>
          <p className="text-sm text-[#848e9c]">Spot buys only</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Buys" value={stats.numBuys.toString()} />
        <StatCard label="Total Invested" value={formatUsd(stats.totalInvested)} />
        <StatCard label="Avg Cost" value={formatUsd(stats.avgCost)} />
        <StatCard
          label="Cost Range"
          value={`${formatUsd(stats.lowPrice)} - ${formatUsd(stats.highPrice)}`}
          sub="Low - High"
        />
        <StatCard label="First Buy" value={formatDate(stats.firstBuyDate)} />
        <StatCard label="Last Buy" value={formatDate(stats.lastBuyDate)} />
        <StatCard label="Total Qty (Spot)" value={formatQty(stats.totalQty)} />
        <StatCard
          label="Current Price"
          value={formatUsd(holding.currentPrice)}
          color={holding.currentPrice >= stats.avgCost ? "text-[#0ecb81]" : "text-[#f6465d]"}
          triangle={holding.currentPrice >= stats.avgCost ? "up" : "down"}
        />
      </div>

      {/* Cost Basis Chart */}
      <div className="rounded-xl bg-[#1e2329] p-5">
        <span className="mb-4 block text-sm font-medium text-white">Cost Basis Over Time</span>
        <div ref={containerRef} style={{ height: 350 }} />
      </div>

      {/* Spot Buy History */}
      <div className="rounded-xl bg-[#1e2329]">
        <div className="px-6 py-4">
          <span className="text-sm font-medium text-white">Spot Buy History</span>
          <span className="ml-2 text-xs text-[#5e6673]">{spotBuys.length} transactions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#848e9c]">
                <th className="px-6 py-3 font-normal">Date</th>
                <th className="px-4 py-3 text-right font-normal">Price</th>
                <th className="px-4 py-3 text-right font-normal">Quantity</th>
                <th className="px-4 py-3 text-right font-normal">Total</th>
                <th className="px-6 py-3 text-right font-normal">Cost Basis</th>
              </tr>
            </thead>
            <tbody>
              {spotBuys.map((tx, i) => (
                <tr
                  key={tx.id}
                  className={`transition-colors hover:bg-[#2b3139] ${
                    i < spotBuys.length - 1 ? "border-b border-[#2b3139]" : ""
                  }`}
                >
                  <td className="px-6 py-3 text-[#eaecef]">{formatDateTime(tx.date)}</td>
                  <td className="px-4 py-3 text-right text-[#eaecef]">{formatUsd(tx.price)}</td>
                  <td className="px-4 py-3 text-right text-[#eaecef]">{formatQty(tx.quantity)}</td>
                  <td className="px-4 py-3 text-right text-[#eaecef]">{formatUsd(tx.quoteAmount)}</td>
                  <td className="px-6 py-3 text-right text-[#f0b90b]">{formatUsd(costBasisByIndex.get(i) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, triangle }: { label: string; value: string; sub?: string; color?: string; triangle?: "up" | "down" }) {
  return (
    <div className="rounded-xl bg-[#1e2329] p-5">
      <p className="text-xs text-[#848e9c]">{label}</p>
      <p className={`mt-1 flex items-center gap-1.5 text-lg font-semibold ${color || "text-white"}`}>
        {triangle && (
          <span className="text-xs">{triangle === "up" ? "\u25B2" : "\u25BC"}</span>
        )}
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-[#5e6673]">{sub}</p>}
    </div>
  );
}
