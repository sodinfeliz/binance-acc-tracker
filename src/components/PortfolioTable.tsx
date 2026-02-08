"use client";

import { CryptoHolding } from "@/lib/types";
import CoinIcon from "./CoinIcon";

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
  if (value > 0) return "text-[#0ecb81]";
  if (value < 0) return "text-[#f6465d]";
  return "text-[#848e9c]";
}

export default function PortfolioTable({ holdings }: PortfolioTableProps) {
  return (
    <div className="rounded-xl bg-[#1e2329]">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[#848e9c]">
            <th className="px-6 py-4 font-normal">Coin</th>
            <th className="px-4 py-4 text-right font-normal">Amount</th>
            <th className="px-4 py-4 text-right font-normal">Avg Cost</th>
            <th className="px-4 py-4 text-right font-normal">Price</th>
            <th className="px-4 py-4 text-right font-normal">Invested</th>
            <th className="px-4 py-4 text-right font-normal">Value</th>
            <th className="px-4 py-4 text-right font-normal">PNL</th>
            <th className="px-6 py-4 text-right font-normal">PNL %</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h, i) => (
            <tr
              key={h.asset}
              className={`transition-colors hover:bg-[#2b3139] ${
                i < holdings.length - 1 ? "border-b border-[#2b3139]" : ""
              }`}
            >
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <CoinIcon asset={h.asset} />
                  <div>
                    <span className="font-medium text-white">{h.asset}</span>
                    <span className="ml-1 text-xs text-[#5e6673]">{h.asset}</span>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4 text-right text-[#eaecef]">
                {formatQty(h.quantity)}
              </td>
              <td className="px-4 py-4 text-right text-[#eaecef]">
                {formatUsd(h.avgBuyCost)}
              </td>
              <td className="px-4 py-4 text-right text-[#eaecef]">
                {formatUsd(h.currentPrice)}
              </td>
              <td className="px-4 py-4 text-right text-[#eaecef]">
                {formatUsd(h.totalInvested)}
              </td>
              <td className="px-4 py-4 text-right font-medium text-white">
                {formatUsd(h.currentValue)}
              </td>
              <td className={`px-4 py-4 text-right ${pnlColor(h.unrealizedPnL)}`}>
                {h.unrealizedPnL >= 0 ? "+" : ""}
                {formatUsd(h.unrealizedPnL)}
              </td>
              <td className={`px-6 py-4 text-right font-medium ${pnlColor(h.pnlPercent)}`}>
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
