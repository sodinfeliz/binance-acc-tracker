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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-white">DCA Analysis</h2>
        <p className="text-xs text-[#848e9c]">
          Cost basis analysis based on spot buy transactions
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="rounded-xl bg-[#1e2329]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#848e9c]">
                  <th className="px-6 py-4 font-normal">Asset</th>
                  <th className="px-4 py-4 text-right font-normal"># Buys</th>
                  <th className="px-4 py-4 text-right font-normal">Total Invested</th>
                  <th className="px-4 py-4 text-right font-normal">Avg Cost</th>
                  <th className="px-4 py-4 text-right font-normal">Current Price</th>
                  <th className="px-6 py-4 text-right font-normal">DCA P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.asset}
                    onClick={() => onSelectAsset(row.asset)}
                    className={`cursor-pointer transition-colors hover:bg-[#2b3139] ${
                      i < rows.length - 1 ? "border-b border-[#2b3139]" : ""
                    }`}
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <CoinIcon asset={row.asset} size={32} />
                        <div>
                          <span className="font-medium text-white">{row.asset}</span>
                          <p className="text-xs text-[#5e6673]">{row.symbol}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right text-[#eaecef]">{row.numBuys}</td>
                    <td className="px-4 py-3.5 text-right text-[#eaecef]">{formatUsd(row.totalInvested)}</td>
                    <td className="px-4 py-3.5 text-right text-[#eaecef]">{formatUsd(row.avgCost)}</td>
                    <td className="px-4 py-3.5 text-right text-[#eaecef]">{formatUsd(row.currentPrice)}</td>
                    <td className="px-6 py-3.5 text-right">
                      <span className={`text-sm font-medium ${row.pnlPercent >= 0 ? "text-[#0ecb81]" : "text-[#f6465d]"}`}>
                        {row.pnlPercent >= 0 ? "+" : ""}{row.pnlPercent.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-[#848e9c]">
          No spot buy transactions found.
        </p>
      )}
    </div>
  );
}
