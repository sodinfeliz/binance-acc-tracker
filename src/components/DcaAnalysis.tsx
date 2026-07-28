"use client";

import { useMemo } from "react";
import { PortfolioData, BinanceTrade, BinanceAutoInvestTransaction, BinanceAssetDividend } from "@/lib/types";
import { unifyTransactions, computeDcaTimeline } from "@/lib/calculations";
import CoinIcon from "./CoinIcon";

interface DcaAnalysisProps {
  portfolio: PortfolioData;
  rawTradesBySymbol: Record<string, BinanceTrade[]>;
  rawAutoInvestByAsset: Record<string, BinanceAutoInvestTransaction[]>;
  rawDividendsByAsset: Record<string, BinanceAssetDividend[]>;
  onSelectAsset: (asset: string) => void;
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface DcaRow {
  asset: string;
  symbol: string;
  numBuys: number;
  totalInvested: number;
  avgCost: number;
  currentPrice: number;
  pnlPercent: number;
}

export default function DcaAnalysis({
  portfolio,
  rawTradesBySymbol,
  rawAutoInvestByAsset,
  rawDividendsByAsset,
  onSelectAsset,
}: DcaAnalysisProps) {
  const rows = useMemo(() => {
    const result: DcaRow[] = [];

    for (const holding of portfolio.holdings) {
      const trades = rawTradesBySymbol[holding.symbol] || [];
      const autoInvest = rawAutoInvestByAsset[holding.asset] || [];
      const dividends = rawDividendsByAsset[holding.asset] || [];
      const unified = unifyTransactions(holding.asset, holding.symbol, trades, autoInvest, dividends);
      const timeline = computeDcaTimeline(unified);

      if (timeline.length === 0) continue;

      const last = timeline[timeline.length - 1];
      const pnlPercent = last.avgCost > 0
        ? ((holding.currentPrice - last.avgCost) / last.avgCost) * 100
        : 0;

      result.push({
        asset: holding.asset,
        symbol: holding.symbol,
        numBuys: timeline.length,
        totalInvested: last.totalInvested,
        avgCost: last.avgCost,
        currentPrice: holding.currentPrice,
        pnlPercent,
      });
    }

    return result.sort((a, b) => b.totalInvested - a.totalInvested);
  }, [portfolio, rawTradesBySymbol, rawAutoInvestByAsset, rawDividendsByAsset]);

  return (
    <div className="panel">
      <div className="panel-title">
        <span>DCA Analysis</span>
        <span className="text-ink-3">COST BASIS · SPOT BUYS</span>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-grid text-left text-[11px] tracking-[0.15em] text-ink-3">
                <th className="px-3 py-2 font-normal">#</th>
                <th className="px-3 py-2 font-normal">SYM</th>
                <th className="px-3 py-2 text-right font-normal">BUYS</th>
                <th className="px-3 py-2 text-right font-normal">INVESTED</th>
                <th className="px-3 py-2 text-right font-normal">AVG COST</th>
                <th className="px-3 py-2 text-right font-normal">LAST</th>
                <th className="px-3 py-2 text-right font-normal">DCA PNL%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.asset}
                  onClick={() => onSelectAsset(row.asset)}
                  className={`cursor-pointer transition-colors hover:bg-panel-2 ${
                    i < rows.length - 1 ? "border-b border-grid/60" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 text-ink-3">{String(i + 1).padStart(2, "0")}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <CoinIcon asset={row.asset} size={20} />
                      <span className="font-bold text-ink">{row.asset}</span>
                      <span className="text-[11px] text-ink-3">{row.symbol}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{row.numBuys}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{formatUsd(row.totalInvested)}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{formatUsd(row.avgCost)}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{formatUsd(row.currentPrice)}</td>
                  <td className={`px-3 py-2.5 text-right ${row.pnlPercent >= 0 ? "text-up" : "text-down"}`}>
                    {row.pnlPercent >= 0 ? "+" : ""}{row.pnlPercent.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-3 py-10 text-center text-[13px] text-ink-2">
          NO SPOT BUY TRANSACTIONS FOUND.
        </p>
      )}
    </div>
  );
}
