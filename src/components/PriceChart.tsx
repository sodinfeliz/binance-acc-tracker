"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, AreaSeries, ColorType } from "lightweight-charts";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { KlineDataPoint } from "@/lib/types";

interface PriceChartProps {
  symbol: string;
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
  { label: "All", interval: "1w", limit: 1000 },
];

function getPricePrecision(minPrice: number): number {
  if (minPrice >= 100) return 2;
  if (minPrice >= 1) return 4;
  if (minPrice >= 0.01) return 6;
  return 8;
}

export default function PriceChart({ symbol }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [activeTimeframe, setActiveTimeframe] = useState(3); // default 3M
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

    chartRef.current = chart;
    seriesRef.current = series;

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
    };
  }, []);

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
        // Set price precision based on data
        const minPrice = Math.min(...data.map((d) => d.value));
        const precision = getPricePrecision(minPrice);
        seriesRef.current.applyOptions({
          priceFormat: { type: "price", precision, minMove: 1 / Math.pow(10, precision) },
        });

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
        <span className="text-sm font-medium text-white">Price Chart</span>
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
