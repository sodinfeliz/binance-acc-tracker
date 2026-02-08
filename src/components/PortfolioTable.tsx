"use client";

import { CryptoHolding } from "@/lib/types";

interface PortfolioTableProps {
  holdings: CryptoHolding[];
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

function pnlColor(value: number): string {
  if (value > 0) return "text-green-400";
  if (value < 0) return "text-red-400";
  return "text-zinc-400";
}

export default function PortfolioTable({ holdings }: PortfolioTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
            <th className="px-4 py-3">Asset</th>
            <th className="px-4 py-3 text-right">Quantity</th>
            <th className="px-4 py-3 text-right">Avg Buy</th>
            <th className="px-4 py-3 text-right">Current Price</th>
            <th className="px-4 py-3 text-right">Invested</th>
            <th className="px-4 py-3 text-right">Current Value</th>
            <th className="px-4 py-3 text-right">P&L</th>
            <th className="px-4 py-3 text-right">P&L %</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr
              key={h.asset}
              className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30"
            >
              <td className="px-4 py-3 font-medium text-white">{h.asset}</td>
              <td className="px-4 py-3 text-right text-zinc-300">
                {formatQty(h.quantity)}
              </td>
              <td className="px-4 py-3 text-right text-zinc-300">
                {formatUsd(h.avgBuyCost)}
              </td>
              <td className="px-4 py-3 text-right text-zinc-300">
                {formatUsd(h.currentPrice)}
              </td>
              <td className="px-4 py-3 text-right text-zinc-300">
                {formatUsd(h.totalInvested)}
              </td>
              <td className="px-4 py-3 text-right text-white">
                {formatUsd(h.currentValue)}
              </td>
              <td className={`px-4 py-3 text-right ${pnlColor(h.unrealizedPnL)}`}>
                {h.unrealizedPnL >= 0 ? "+" : ""}
                {formatUsd(h.unrealizedPnL)}
              </td>
              <td className={`px-4 py-3 text-right ${pnlColor(h.pnlPercent)}`}>
                {h.pnlPercent >= 0 ? "+" : ""}
                {h.pnlPercent.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
