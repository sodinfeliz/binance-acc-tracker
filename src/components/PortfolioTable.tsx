"use client";

import { CryptoHolding } from "@/lib/types";
import CoinIcon from "./CoinIcon";

interface PortfolioTableProps {
  holdings: CryptoHolding[];
  onSelectHolding?: (asset: string) => void;
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
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-ink-2";
}

export default function PortfolioTable({ holdings, onSelectHolding }: PortfolioTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-grid text-left text-[11px] tracking-[0.15em] text-ink-3">
            <th className="px-3 py-2 font-normal">#</th>
            <th className="px-3 py-2 font-normal">SYM</th>
            <th className="px-3 py-2 text-right font-normal">AMOUNT</th>
            <th className="px-3 py-2 text-right font-normal">AVG COST</th>
            <th className="px-3 py-2 text-right font-normal">PRICE</th>
            <th className="px-3 py-2 text-right font-normal">INVESTED</th>
            <th className="px-3 py-2 text-right font-normal">VALUE</th>
            <th className="px-3 py-2 text-right font-normal">PNL</th>
            <th className="px-3 py-2 text-right font-normal">PNL%</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h, i) => (
            <tr
              key={h.asset}
              onClick={() => onSelectHolding?.(h.asset)}
              className={`cursor-pointer transition-colors hover:bg-panel-2 ${
                i < holdings.length - 1 ? "border-b border-grid/60" : ""
              }`}
            >
              <td className="px-3 py-2.5 text-ink-3">{String(i + 1).padStart(2, "0")}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <CoinIcon asset={h.asset} size={20} />
                  <span className="font-bold text-ink">{h.asset}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right text-ink-2">
                {formatQty(h.quantity)}
              </td>
              <td className="px-3 py-2.5 text-right text-ink-2">
                {formatUsd(h.avgBuyCost)}
              </td>
              <td className="px-3 py-2.5 text-right text-ink-2">
                {formatUsd(h.currentPrice)}
              </td>
              <td className="px-3 py-2.5 text-right text-ink-2">
                {formatUsd(h.totalInvested)}
              </td>
              <td className="px-3 py-2.5 text-right text-ink">
                {formatUsd(h.currentValue)}
              </td>
              <td className={`px-3 py-2.5 text-right ${pnlColor(h.unrealizedPnL)}`}>
                {h.unrealizedPnL >= 0 ? "+" : ""}
                {formatUsd(h.unrealizedPnL)}
              </td>
              <td className={`px-3 py-2.5 text-right ${pnlColor(h.pnlPercent)}`}>
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
