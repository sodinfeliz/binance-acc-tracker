"use client";

import { useMemo, useState } from "react";
import { CryptoHolding, BinanceTrade, BinanceAutoInvestTransaction, BinanceAssetDividend } from "@/lib/types";
import { unifyTransactions, computeHoldingStats } from "@/lib/calculations";
import CoinIcon from "./CoinIcon";

interface HoldingDetailProps {
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

export default function HoldingDetail({ holding, trades, autoInvestTxs, dividends, onBack }: HoldingDetailProps) {
  const transactions = useMemo(
    () => unifyTransactions(holding.asset, holding.symbol, trades, autoInvestTxs, dividends),
    [holding.asset, holding.symbol, trades, autoInvestTxs, dividends]
  );

  const stats = useMemo(() => computeHoldingStats(transactions), [transactions]);

  type SourceFilter = "all" | "spot" | "auto-invest" | "earn";
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const filteredTransactions = useMemo(
    () => sourceFilter === "all" ? transactions : transactions.filter((tx) => tx.source === sourceFilter),
    [transactions, sourceFilter]
  );

  const spotCount = useMemo(() => transactions.filter((tx) => tx.source === "spot").length, [transactions]);
  const autoInvestCount = useMemo(() => transactions.filter((tx) => tx.source === "auto-invest").length, [transactions]);
  const earnCount = useMemo(() => transactions.filter((tx) => tx.source === "earn").length, [transactions]);

  const pnlColor = holding.pnlPercent >= 0 ? "text-[#0ecb81]" : "text-[#f6465d]";

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
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${holding.pnlPercent >= 0 ? "bg-[#0ecb81]/15 text-[#0ecb81]" : "bg-[#f6465d]/15 text-[#f6465d]"}`}>
              {holding.pnlPercent >= 0 ? "+" : ""}{holding.pnlPercent.toFixed(2)}%
            </span>
          </div>
          <p className="text-sm text-[#848e9c]">
            {formatUsd(holding.currentPrice)} &middot; {formatQty(holding.quantity)} {holding.asset}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xl font-semibold text-white">{formatUsd(holding.currentValue)}</p>
          <p className={`text-sm ${pnlColor}`}>
            {holding.unrealizedPnL >= 0 ? "+" : ""}{formatUsd(holding.unrealizedPnL)}
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Avg Buy Price" value={formatUsd(stats.avgBuyPrice)} />
        <StatCard label="Total Invested" value={formatUsd(stats.totalCostBasis)} />
        <StatCard
          label="Transactions"
          value={stats.totalTransactions.toString()}
          sub={`${stats.totalBuyTransactions} buy / ${stats.totalSellTransactions} sell`}
        />
        <StatCard label="Total Fees" value={formatUsd(stats.totalFeesPaid)} />
        <StatCard label="Highest Entry" value={formatUsd(stats.highestBuyPrice)} />
        <StatCard label="Lowest Entry" value={formatUsd(stats.lowestBuyPrice)} />
        <StatCard label="Total Bought" value={formatQty(stats.totalBought)} />
        <StatCard label="Total Sold" value={formatQty(stats.totalSold)} />
        {stats.totalRewards > 0 && (
          <StatCard
            label="Earn Rewards"
            value={formatQty(stats.totalRewards)}
            sub={`~${formatUsd(stats.totalRewards * holding.currentPrice)} (${stats.totalRewardTransactions} distributions)`}
          />
        )}
      </div>

      {/* Date range */}
      {stats.firstTradeDate > 0 && (
        <p className="text-xs text-[#5e6673]">
          Trading since {formatDate(stats.firstTradeDate)} &middot; Last trade {formatDate(stats.lastTradeDate)}
        </p>
      )}

      {/* Transaction history table */}
      <div className="rounded-xl bg-[#1e2329]">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <span className="text-sm font-medium text-white">Transaction History</span>
            <span className="ml-2 text-xs text-[#5e6673]">{filteredTransactions.length} transactions</span>
          </div>
          <div className="flex gap-1 rounded-lg bg-[#2b3139] p-1">
            {([
              { key: "all" as const, label: "All", count: transactions.length },
              { key: "spot" as const, label: "Spot", count: spotCount },
              { key: "auto-invest" as const, label: "Auto-Invest", count: autoInvestCount },
              { key: "earn" as const, label: "Earn", count: earnCount },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSourceFilter(tab.key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  sourceFilter === tab.key
                    ? "bg-[#fcd535] text-[#202630]"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#848e9c]">
                <th className="px-6 py-3 font-normal">Date</th>
                <th className="px-4 py-3 font-normal">Type</th>
                <th className="px-4 py-3 font-normal">Source</th>
                <th className="px-4 py-3 text-right font-normal">Price</th>
                <th className="px-4 py-3 text-right font-normal">Quantity</th>
                <th className="px-4 py-3 text-right font-normal">Total</th>
                <th className="px-6 py-3 text-right font-normal">Fee</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx, i) => (
                <tr
                  key={tx.id}
                  className={`transition-colors hover:bg-[#2b3139] ${
                    i < filteredTransactions.length - 1 ? "border-b border-[#2b3139]" : ""
                  }`}
                >
                  <td className="px-6 py-3 text-[#eaecef]">{formatDateTime(tx.date)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${
                      tx.type === "buy" ? "text-[#0ecb81]" : tx.type === "reward" ? "text-[#1e88e5]" : "text-[#f6465d]"
                    }`}>
                      {tx.type === "buy" ? "Buy" : tx.type === "reward" ? "Reward" : "Sell"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${
                      tx.source === "spot"
                        ? "bg-[#f0b90b]/15 text-[#f0b90b]"
                        : tx.source === "earn"
                        ? "bg-[#0ecb81]/15 text-[#0ecb81]"
                        : "bg-[#1e88e5]/15 text-[#1e88e5]"
                    }`}>
                      {tx.source === "spot" ? "Spot" : tx.source === "earn" ? "Earn" : "Auto-Invest"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[#eaecef]">{tx.price > 0 ? formatUsd(tx.price) : "-"}</td>
                  <td className="px-4 py-3 text-right text-[#eaecef]">{formatQty(tx.quantity)}</td>
                  <td className="px-4 py-3 text-right text-[#eaecef]">{tx.quoteAmount > 0 ? formatUsd(tx.quoteAmount) : "-"}</td>
                  <td className="px-6 py-3 text-right text-[#5e6673]">
                    {tx.fee > 0 ? `${formatQty(tx.fee)} ${tx.feeAsset}` : "-"}
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-[#848e9c]">
                    No transactions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[#1e2329] p-5">
      <p className="text-xs text-[#848e9c]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#5e6673]">{sub}</p>}
    </div>
  );
}
