import {
  BinanceTrade,
  BinanceTickerPrice,
  BinanceBalance,
  CryptoHolding,
  PortfolioData,
} from "./types";

export function calculateHolding(
  asset: string,
  symbol: string,
  trades: BinanceTrade[],
  currentPrice: number,
  balance: BinanceBalance
): CryptoHolding {
  let totalQtyBought = 0;
  let totalCostUsdt = 0;

  for (const trade of trades) {
    if (!trade.isBuyer) continue;

    const qty = parseFloat(trade.qty);
    const quoteQty = parseFloat(trade.quoteQty);
    const commission = parseFloat(trade.commission);

    let effectiveQty = qty;
    let effectiveCost = quoteQty;

    // Commission handling
    if (trade.commissionAsset === asset) {
      // Commission paid in base asset — reduces quantity received
      effectiveQty -= commission;
    } else if (trade.commissionAsset === "USDT") {
      // Commission paid in quote asset — adds to cost
      effectiveCost += commission;
    }
    // If commission paid in BNB or other asset, no adjustment needed

    totalQtyBought += effectiveQty;
    totalCostUsdt += effectiveCost;
  }

  const quantity = parseFloat(balance.free) + parseFloat(balance.locked);
  const avgBuyCost = totalQtyBought > 0 ? totalCostUsdt / totalQtyBought : 0;
  const totalInvested = avgBuyCost * quantity;
  const currentValue = currentPrice * quantity;
  const unrealizedPnL = currentValue - totalInvested;
  const pnlPercent = totalInvested > 0 ? (unrealizedPnL / totalInvested) * 100 : 0;

  return {
    asset,
    symbol,
    quantity,
    avgBuyCost,
    totalInvested,
    currentPrice,
    currentValue,
    unrealizedPnL,
    pnlPercent,
  };
}

export function buildPortfolio(
  balances: BinanceBalance[],
  tradesBySymbol: Record<string, BinanceTrade[]>,
  prices: BinanceTickerPrice[]
): PortfolioData {
  const priceMap = new Map<string, number>();
  for (const p of prices) {
    priceMap.set(p.symbol, parseFloat(p.price));
  }

  const holdings: CryptoHolding[] = [];

  for (const balance of balances) {
    const asset = balance.asset;
    if (asset === "USDT") continue;

    const symbol = `${asset}USDT`;
    const currentPrice = priceMap.get(symbol);
    if (currentPrice === undefined) continue;

    const trades = tradesBySymbol[symbol] || [];
    const holding = calculateHolding(asset, symbol, trades, currentPrice, balance);

    // Only include holdings with meaningful value (> $1)
    if (holding.currentValue > 1) {
      holdings.push(holding);
    }
  }

  // Sort by current value descending
  holdings.sort((a, b) => b.currentValue - a.currentValue);

  const totalInvested = holdings.reduce((sum, h) => sum + h.totalInvested, 0);
  const totalCurrentValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const totalPnL = totalCurrentValue - totalInvested;
  const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  return {
    holdings,
    totalInvested,
    totalCurrentValue,
    totalPnL,
    totalPnLPercent,
  };
}
