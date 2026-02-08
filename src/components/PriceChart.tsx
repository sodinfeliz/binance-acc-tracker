"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, AreaSeries, ColorType, LineStyle } from "lightweight-charts";
import type { IChartApi, ISeriesApi, IPriceLine, UTCTimestamp } from "lightweight-charts";
import type { KlineDataPoint, UnifiedTransaction } from "@/lib/types";

interface PriceChartProps {
  symbol: string;
  avgBuyPrice?: number;
  transactions?: UnifiedTransaction[];
}

interface TimeframeOption {
  label: string;
  interval: string;
  limit: number;
}

const TIMEFRAMES: TimeframeOption[] = [
  { label: "1D", interval: "15m", limit: 96 },
  { label: "1W", interval: "1h", limit: 168 },
  { label: "1M", interval: "4h", limit: 180 },
  { label: "3M", interval: "1d", limit: 90 },
  { label: "1Y", interval: "1d", limit: 365 },
  { label: "5Y", interval: "1w", limit: 260 },
  { label: "All", interval: "1w", limit: 1000 },
];

function getPricePrecision(minPrice: number): number {
  if (minPrice >= 100) return 2;
  if (minPrice >= 1) return 4;
  if (minPrice >= 0.01) return 6;
  return 8;
}

function snapToBar(timestampSec: number, barTimes: number[]): number {
  let best = barTimes[0];
  let bestDist = Math.abs(timestampSec - best);
  for (let i = 1; i < barTimes.length; i++) {
    const dist = Math.abs(timestampSec - barTimes[i]);
    if (dist < bestDist) {
      best = barTimes[i];
      bestDist = dist;
    }
    if (barTimes[i] > timestampSec) break;
  }
  return best;
}

// Custom series primitive that draws "B"/"S" inside filled circles
interface TradeMarkerData {
  time: UTCTimestamp;
  price: number;
  isBuy: boolean;
}

function createTradeMarkersPrimitive() {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let chart: any = null;
  let series: any = null;
  let reqUpdate: (() => void) | null = null;
  let trades: TradeMarkerData[] = [];
  let renderPts: { x: number; y: number; isBuy: boolean }[] = [];

  const R = 8;

  const view = {
    renderer() {
      const pts = renderPts;
      return {
        draw(target: any) {
          target.useMediaCoordinateSpace(
            ({ context: ctx }: { context: CanvasRenderingContext2D }) => {
              ctx.font = "bold 10px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              for (const p of pts) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
                ctx.fillStyle = p.isBuy ? "#0ecb81" : "#f6465d";
                ctx.fill();
                ctx.fillStyle = "#fff";
                ctx.fillText(p.isBuy ? "B" : "S", p.x, p.y);
              }
            }
          );
        },
      };
    },
  };

  return {
    attached(params: any) {
      chart = params.chart;
      series = params.series;
      reqUpdate = params.requestUpdate;
    },
    detached() {
      chart = series = reqUpdate = null;
    },
    setTrades(t: TradeMarkerData[]) {
      trades = t;
      reqUpdate?.();
    },
    updateAllViews() {
      renderPts = [];
      if (!chart || !series) return;
      const ts = chart.timeScale();
      for (const t of trades) {
        const x = ts.timeToCoordinate(t.time);
        const y = series.priceToCoordinate(t.price);
        if (x === null || y === null) continue;
        renderPts.push({
          x: x as number,
          y: y as number,
          isBuy: t.isBuy,
        });
      }
    },
    paneViews() {
      return [view];
    },
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

type TradesPrimitive = ReturnType<typeof createTradeMarkersPrimitive>;

export default function PriceChart({ symbol, avgBuyPrice, transactions }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const tradesPrimitiveRef = useRef<TradesPrimitive | null>(null);
  const [activeTimeframe, setActiveTimeframe] = useState(3); // default 3M
  const [showAvgBuy, setShowAvgBuy] = useState(false);
  const [showTrades, setShowTrades] = useState(false);
  const [klineData, setKlineData] = useState<KlineDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

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

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#f0b90b",
      topColor: "rgba(240, 185, 11, 0.4)",
      bottomColor: "rgba(240, 185, 11, 0.0)",
      lineWidth: 2,
    });

    const primitive = createTradeMarkersPrimitive();
    series.attachPrimitive(primitive);

    chartRef.current = chart;
    seriesRef.current = series;
    tradesPrimitiveRef.current = primitive;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        chart.applyOptions({ width });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      tradesPrimitiveRef.current = null;
    };
  }, []);

  // Manage avg buy price line
  useEffect(() => {
    if (!seriesRef.current) return;

    if (showAvgBuy && avgBuyPrice && avgBuyPrice > 0) {
      if (!priceLineRef.current) {
        priceLineRef.current = seriesRef.current.createPriceLine({
          price: avgBuyPrice,
          color: "#1e88e5",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Avg Buy",
        });
      }
    } else if (priceLineRef.current) {
      seriesRef.current.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
  }, [showAvgBuy, avgBuyPrice]);

  // Manage trade markers (grouped by bar, drawn as circles with B/S inside)
  useEffect(() => {
    const primitive = tradesPrimitiveRef.current;
    if (!primitive) return;

    const spotTrades = transactions?.filter(
      (tx) => tx.source === "spot" && (tx.type === "buy" || tx.type === "sell") && tx.price > 0
    );

    if (!showTrades || !spotTrades || spotTrades.length === 0 || klineData.length === 0) {
      primitive.setTrades([]);
      return;
    }

    const barTimes = klineData.map((d) => d.time);
    const priceMap = new Map(klineData.map((d) => [d.time, d.value]));

    const rangeStart = barTimes[0];
    const rangeEnd = barTimes[barTimes.length - 1];
    const barDuration = barTimes.length >= 2 ? barTimes[1] - barTimes[0] : 0;

    // Group trades by nearest bar
    const groups = new Map<number, { buys: number; sells: number }>();
    for (const tx of spotTrades) {
      const txSec = Math.floor(tx.date / 1000);
      if (txSec < rangeStart - barDuration / 2 || txSec > rangeEnd + barDuration / 2) continue;
      const snapped = snapToBar(txSec, barTimes);
      const group = groups.get(snapped) || { buys: 0, sells: 0 };
      if (tx.type === "buy") group.buys++;
      else group.sells++;
      groups.set(snapped, group);
    }

    // One marker per bar, positioned on the price line
    const tradeMarkers: TradeMarkerData[] = Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([time, { buys, sells }]) => ({
        time: time as UTCTimestamp,
        price: priceMap.get(time) ?? 0,
        isBuy: buys >= sells,
      }));

    primitive.setTrades(tradeMarkers);
  }, [showTrades, transactions, klineData]);

  // Fetch data when timeframe changes
  const fetchData = useCallback(async () => {
    const tf = TIMEFRAMES[activeTimeframe];
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/klines?symbol=${symbol}&interval=${tf.interval}&limit=${tf.limit}`
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: KlineDataPoint[] = await res.json();

      if (seriesRef.current && chartRef.current) {
        const minPrice = Math.min(...data.map((d) => d.value));
        const precision = getPricePrecision(minPrice);
        seriesRef.current.applyOptions({
          priceFormat: { type: "price", precision, minMove: 1 / Math.pow(10, precision) },
        });

        setKlineData(data);

        seriesRef.current.setData(
          data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value }))
        );
        chartRef.current.timeScale().fitContent();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chart data");
    } finally {
      setLoading(false);
    }
  }, [symbol, activeTimeframe]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="rounded-xl bg-[#1e2329] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-white">Price Chart</span>
          {avgBuyPrice !== undefined && avgBuyPrice > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#848e9c]">
              <input
                type="checkbox"
                checked={showAvgBuy}
                onChange={(e) => setShowAvgBuy(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[#2b3139] bg-[#2b3139] accent-[#1e88e5]"
              />
              Avg Buy
            </label>
          )}
          {transactions && transactions.some((tx) => tx.source === "spot" && (tx.type === "buy" || tx.type === "sell")) && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#848e9c]">
              <input
                type="checkbox"
                checked={showTrades}
                onChange={(e) => setShowTrades(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[#2b3139] bg-[#2b3139] accent-[#0ecb81]"
              />
              Trades
            </label>
          )}
        </div>
        <div className="flex gap-1 rounded-lg bg-[#2b3139] p-1">
          {TIMEFRAMES.map((tf, i) => (
            <button
              key={tf.label}
              onClick={() => setActiveTimeframe(i)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                activeTimeframe === i
                  ? "bg-[#fcd535] text-[#202630]"
                  : "text-[#848e9c] hover:text-white"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <div ref={containerRef} style={{ height: 350 }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1e2329]/80">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#f0b90b] border-t-transparent" />
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1e2329]/80">
            <p className="text-sm text-[#f6465d]">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
