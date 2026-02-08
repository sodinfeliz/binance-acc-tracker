import {
  BinanceTrade,
  BinanceTickerPrice,
  BinanceBalance,
  BinanceAutoInvestTransaction,
  CryptoHolding,
  PortfolioData,
} from "./types";

export function calculateHolding(
  asset: string,
  symbol: string,
  trades: BinanceTrade[],
  autoInvestTxs: BinanceAutoInvestTransaction[],
  currentPrice: number,
  balance: BinanceBalance
): CryptoHolding {
  let totalQtyBought = 0;
  let totalCostUsdt = 0;

  // Regular spot trades
  for (const trade of trades) {
    if (!trade.isBuyer) continue;

    const qty = parseFloat(trade.qty);
    const quoteQty = parseFloat(trade.quoteQty);
    const commission = parseFloat(trade.commission);

    let effectiveQty = qty;
    let effectiveCost = quoteQty;

    // Commission handling
    if (trade.commissionAsset === asset) {
      effectiveQty -= commission;
    } else if (trade.commissionAsset === "USDT") {
      effectiveCost += commission;
    }

    totalQtyBought += effectiveQty;
    totalCostUsdt += effectiveCost;
  }

  // Auto-invest / Index-Linked Plan transactions
  for (const tx of autoInvestTxs) {
    const qty = parseFloat(tx.targetAssetAmount);
    const cost = parseFloat(tx.sourceAssetAmount);
    const fee = parseFloat(tx.transactionFee);

    let effectiveCost = cost;
    // If fee is in the same currency as source (USDT/BUSD), add to cost
    if (tx.transactionFeeUnit === tx.sourceAsset) {
      effectiveCost += fee;
    }

    totalQtyBought += qty;
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
  autoInvestByAsset: Record<string, BinanceAutoInvestTransaction[]>,
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
    const autoInvestTxs = autoInvestByAsset[asset] || [];
    const holding = calculateHolding(asset, symbol, trades, autoInvestTxs, currentPrice, balance);

    if (holding.currentValue > 1) {
      holdings.push(holding);
    }
  }

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
