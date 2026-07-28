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
        background: { type: ColorType.Solid, color: "#0b0f13" },
        textColor: "#8b97a3",
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.05)" },
        horzLines: { color: "rgba(255, 255, 255, 0.05)" },
      },
      crosshair: {
        vertLine: { color: "#f5a623", width: 1, style: 2, labelBackgroundColor: "#f5a623" },
        horzLine: { color: "#f5a623", width: 1, style: 2, labelBackgroundColor: "#f5a623" },
      },
      timeScale: {
        borderColor: "#1d252d",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#1d252d",
      },
      handleScroll: { vertTouchDrag: false },
    });

    const minPrice = Math.min(...timeline.map((d) => d.avgCost));
    const precision = getPricePrecision(minPrice);

    const avgCostSeries = chart.addSeries(LineSeries, {
      color: "#f5a623",
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
      color: priceInProfit ? "#00d68f" : "#ff3b5c",
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
      <div className="panel">
        <div className="panel-title">
          <button onClick={onBack} className="tracking-[0.15em] text-ink-2 transition-colors hover:text-amber">
            [ESC] BACK
          </button>
          <span className="text-ink-3">DCA: {holding.symbol}</span>
        </div>
        <div className="flex items-center gap-3 p-4">
          <CoinIcon asset={holding.asset} size={28} />
          <span className="text-2xl font-bold tracking-tight text-ink">{holding.asset}</span>
        </div>
        <p className="px-4 pb-10 text-center text-[13px] text-ink-2">NO SPOT BUY TRANSACTIONS FOUND FOR THIS ASSET.</p>
      </div>
    );
  }

  const pnlPercent = stats.avgCost > 0
    ? ((holding.currentPrice - stats.avgCost) / stats.avgCost) * 100
    : 0;

  return (
    <div className="space-y-3">
      {/* Instrument readout */}
      <div className="panel">
        <div className="panel-title">
          <button onClick={onBack} className="tracking-[0.15em] text-ink-2 transition-colors hover:text-amber">
            [ESC] BACK
          </button>
          <span className="text-ink-3">DCA: {holding.symbol} · SPOT BUYS ONLY</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
          <div className="flex items-center gap-3">
            <CoinIcon asset={holding.asset} size={28} />
            <span className="text-2xl font-bold tracking-tight text-ink">{holding.asset}</span>
            <span className={`text-[13px] ${pnlPercent >= 0 ? "text-up" : "text-down"}`}>
              {pnlPercent >= 0 ? "▲ +" : "▼ "}{pnlPercent.toFixed(2)}%
            </span>
          </div>
          <div className="text-[13px]">
            <span className="text-ink-3">AVG COST </span>
            <span className="text-amber">{formatUsd(stats.avgCost)}</span>
          </div>
          <div className="text-[13px]">
            <span className="text-ink-3">LAST </span>
            <span className={holding.currentPrice >= stats.avgCost ? "text-up" : "text-down"}>
              {holding.currentPrice >= stats.avgCost ? "▲ " : "▼ "}{formatUsd(holding.currentPrice)}
            </span>
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-px border border-grid bg-grid md:grid-cols-4">
        <StatCell label="TOTAL BUYS" value={stats.numBuys.toString()} />
        <StatCell label="INVESTED" value={formatUsd(stats.totalInvested)} />
        <StatCell label="AVG COST" value={formatUsd(stats.avgCost)} />
        <StatCell
          label="COST RANGE"
          value={`${formatUsd(stats.lowPrice)} – ${formatUsd(stats.highPrice)}`}
        />
        <StatCell label="FIRST BUY" value={formatDate(stats.firstBuyDate).toUpperCase()} />
        <StatCell label="LAST BUY" value={formatDate(stats.lastBuyDate).toUpperCase()} />
        <StatCell label="QTY (SPOT)" value={formatQty(stats.totalQty)} />
        <StatCell
          label="LAST PRICE"
          value={formatUsd(holding.currentPrice)}
          color={holding.currentPrice >= stats.avgCost ? "text-up" : "text-down"}
        />
      </div>

      {/* Cost Basis Chart */}
      <div className="panel">
        <div className="panel-title">
          <span>Cost Basis Over Time</span>
          <span className="text-ink-3">AVG COST / CURRENT</span>
        </div>
        <div className="p-2">
          <div ref={containerRef} style={{ height: 350 }} />
        </div>
      </div>

      {/* Spot Buy History */}
      <div className="panel">
        <div className="panel-title">
          <span>
            Spot Buy History <span className="text-ink-3">/ {spotBuys.length}</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-grid text-left text-[11px] tracking-[0.15em] text-ink-3">
                <th className="px-3 py-2 font-normal">DATE</th>
                <th className="px-3 py-2 text-right font-normal">PRICE</th>
                <th className="px-3 py-2 text-right font-normal">QTY</th>
                <th className="px-3 py-2 text-right font-normal">TOTAL</th>
                <th className="px-3 py-2 text-right font-normal">COST BASIS</th>
              </tr>
            </thead>
            <tbody>
              {spotBuys.map((tx, i) => (
                <tr
                  key={tx.id}
                  className={`transition-colors hover:bg-panel-2 ${
                    i < spotBuys.length - 1 ? "border-b border-grid/60" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-ink-2">{formatDateTime(tx.date)}</td>
                  <td className="px-3 py-2 text-right text-ink-2">{formatUsd(tx.price)}</td>
                  <td className="px-3 py-2 text-right text-ink-2">{formatQty(tx.quantity)}</td>
                  <td className="px-3 py-2 text-right text-ink">{formatUsd(tx.quoteAmount)}</td>
                  <td className="px-3 py-2 text-right text-amber">{formatUsd(costBasisByIndex.get(i) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-panel p-4">
      <p className="text-[11px] tracking-[0.2em] text-ink-3">{label}</p>
      <p className={`mt-2 text-[15px] ${color || "text-ink"}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-ink-3">{sub}</p>}
    </div>
  );
}
