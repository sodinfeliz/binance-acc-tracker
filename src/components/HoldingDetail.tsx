"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CryptoHolding, BinanceTrade, BinanceAutoInvestTransaction, BinanceAssetDividend } from "@/lib/types";
import { unifyTransactions, computeHoldingStats } from "@/lib/calculations";
import CoinIcon from "./CoinIcon";

const PriceChart = dynamic(() => import("./PriceChart"), { ssr: false });

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

  const pnlColor = holding.pnlPercent >= 0 ? "text-up" : "text-down";

  return (
    <div className="space-y-3">
      {/* Instrument readout */}
      <div className="panel">
        <div className="panel-title">
          <button onClick={onBack} className="tracking-[0.15em] text-ink-2 transition-colors hover:text-amber">
            [ESC] BACK
          </button>
          <span className="text-ink-3">INSTRUMENT: {holding.symbol}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
          <div className="flex items-center gap-3">
            <CoinIcon asset={holding.asset} size={28} />
            <span className="text-2xl font-bold tracking-tight text-ink">{holding.asset}</span>
            <span className={`text-[13px] ${pnlColor}`}>
              {holding.pnlPercent >= 0 ? "▲ +" : "▼ "}{holding.pnlPercent.toFixed(2)}%
            </span>
          </div>
          <div className="text-[13px]">
            <span className="text-ink-3">LAST </span>
            <span className="text-ink">{formatUsd(holding.currentPrice)}</span>
          </div>
          <div className="text-[13px]">
            <span className="text-ink-3">QTY </span>
            <span className="text-ink">{formatQty(holding.quantity)}</span>
          </div>
          <div className="ml-auto text-right text-[13px]">
            <span className="text-ink-3">VALUE </span>
            <span className="text-lg font-bold text-ink">{formatUsd(holding.currentValue)}</span>
            <span className={`ml-3 ${pnlColor}`}>
              {holding.unrealizedPnL >= 0 ? "+" : ""}{formatUsd(holding.unrealizedPnL)}
            </span>
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-px border border-grid bg-grid md:grid-cols-4">
        <StatCell label="AVG BUY" value={formatUsd(stats.avgBuyPrice)} />
        <StatCell label="INVESTED" value={formatUsd(stats.totalCostBasis)} />
        <StatCell
          label="TXNS"
          value={stats.totalTransactions.toString()}
          sub={`${stats.totalBuyTransactions} BUY / ${stats.totalSellTransactions} SELL`}
        />
        <StatCell label="FEES" value={formatUsd(stats.totalFeesPaid)} />
        <StatCell
          label="ENTRY RANGE"
          value={`${formatUsd(stats.lowestBuyPrice)} – ${formatUsd(stats.highestBuyPrice)}`}
        />
        <StatCell label="BOUGHT" value={formatQty(stats.totalBought)} />
        <StatCell label="SOLD" value={formatQty(stats.totalSold)} />
        {stats.totalRewards > 0 ? (
          <StatCell
            label="EARN RWD"
            value={formatQty(stats.totalRewards)}
            sub={`~${formatUsd(stats.totalRewards * holding.currentPrice)} · ${stats.totalRewardTransactions} DISTR`}
          />
        ) : (
          <StatCell label="EARN RWD" value="—" />
        )}
      </div>

      {/* Price chart */}
      <PriceChart symbol={holding.symbol} avgBuyPrice={stats.avgBuyPrice} transactions={transactions} />

      {/* Date range */}
      {stats.firstTradeDate > 0 && (
        <p className="text-[11px] tracking-[0.1em] text-ink-3">
          FIRST TRADE {formatDate(stats.firstTradeDate).toUpperCase()} · LAST TRADE {formatDate(stats.lastTradeDate).toUpperCase()}
        </p>
      )}

      {/* Transaction history */}
      <div className="panel">
        <div className="panel-title">
          <span>
            Transactions <span className="text-ink-3">/ {filteredTransactions.length}</span>
          </span>
          <div className="flex normal-case tracking-normal">
            {([
              { key: "all" as const, label: "ALL", count: transactions.length },
              { key: "spot" as const, label: "SPOT", count: spotCount },
              { key: "auto-invest" as const, label: "AUTO", count: autoInvestCount },
              { key: "earn" as const, label: "EARN", count: earnCount },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSourceFilter(tab.key)}
                className={`border border-l-0 border-grid px-2.5 py-1 text-[11px] first:border-l transition-colors ${
                  sourceFilter === tab.key
                    ? "bg-amber text-bg"
                    : "text-ink-2 hover:bg-panel-2 hover:text-ink"
                }`}
              >
                {tab.label}:{tab.count}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-grid text-left text-[11px] tracking-[0.15em] text-ink-3">
                <th className="px-3 py-2 font-normal">DATE</th>
                <th className="px-3 py-2 font-normal">TYPE</th>
                <th className="px-3 py-2 font-normal">SRC</th>
                <th className="px-3 py-2 text-right font-normal">PRICE</th>
                <th className="px-3 py-2 text-right font-normal">QTY</th>
                <th className="px-3 py-2 text-right font-normal">TOTAL</th>
                <th className="px-3 py-2 text-right font-normal">FEE</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx, i) => (
                <tr
                  key={tx.id}
                  className={`transition-colors hover:bg-panel-2 ${
                    i < filteredTransactions.length - 1 ? "border-b border-grid/60" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-ink-2">{formatDateTime(tx.date)}</td>
                  <td className="px-3 py-2">
                    <span className={
                      tx.type === "buy" ? "text-up" : tx.type === "reward" ? "text-cyan" : "text-down"
                    }>
                      {tx.type === "buy" ? "[BUY]" : tx.type === "reward" ? "[RWD]" : "[SELL]"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={
                      tx.source === "spot"
                        ? "text-amber"
                        : tx.source === "earn"
                        ? "text-up"
                        : "text-cyan"
                    }>
                      {tx.source === "spot" ? "SPOT" : tx.source === "earn" ? "EARN" : "AUTO"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-ink-2">{tx.price > 0 ? formatUsd(tx.price) : "—"}</td>
                  <td className="px-3 py-2 text-right text-ink-2">{formatQty(tx.quantity)}</td>
                  <td className="px-3 py-2 text-right text-ink">{tx.quoteAmount > 0 ? formatUsd(tx.quoteAmount) : "—"}</td>
                  <td className="px-3 py-2 text-right text-ink-3">
                    {tx.fee > 0 ? `${formatQty(tx.fee)} ${tx.feeAsset}` : "—"}
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-ink-2">
                    NO TRANSACTIONS FOUND
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

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-panel p-4">
      <p className="text-[11px] tracking-[0.2em] text-ink-3">{label}</p>
      <p className="mt-2 text-[15px] text-ink">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-ink-3">{sub}</p>}
    </div>
  );
}
