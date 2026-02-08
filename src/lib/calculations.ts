import {
  BinanceTrade,
  BinanceTickerPrice,
  BinanceBalance,
  BinanceAutoInvestTransaction,
  BinanceAssetDividend,
  CryptoHolding,
  PortfolioData,
  UnifiedTransaction,
  HoldingStats,
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

export function unifyTransactions(
  asset: string,
  symbol: string,
  trades: BinanceTrade[],
  autoInvestTxs: BinanceAutoInvestTransaction[],
  dividends: BinanceAssetDividend[] = []
): UnifiedTransaction[] {
  const unified: UnifiedTransaction[] = [];

  for (const t of trades) {
    unified.push({
      id: `spot-${t.id}`,
      date: t.time,
      type: t.isBuyer ? "buy" : "sell",
      source: "spot",
      price: parseFloat(t.price),
      quantity: parseFloat(t.qty),
      quoteAmount: parseFloat(t.quoteQty),
      fee: parseFloat(t.commission),
      feeAsset: t.commissionAsset,
    });
  }

  for (const tx of autoInvestTxs) {
    unified.push({
      id: `auto-${tx.id}`,
      date: tx.transactionDateTime,
      type: "buy",
      source: "auto-invest",
      price: parseFloat(tx.executionPrice),
      quantity: parseFloat(tx.targetAssetAmount),
      quoteAmount: parseFloat(tx.sourceAssetAmount),
      fee: parseFloat(tx.transactionFee),
      feeAsset: tx.transactionFeeUnit,
    });
  }

  for (const d of dividends) {
    unified.push({
      id: `earn-${d.id}`,
      date: d.divTime,
      type: "reward",
      source: "earn",
      price: 0,
      quantity: parseFloat(d.amount),
      quoteAmount: 0,
      fee: 0,
      feeAsset: "",
    });
  }

  // Sort newest first
  unified.sort((a, b) => b.date - a.date);
  return unified;
}

export function computeHoldingStats(transactions: UnifiedTransaction[]): HoldingStats {
  let totalBuyTransactions = 0;
  let totalSellTransactions = 0;
  let totalRewardTransactions = 0;
  let totalBought = 0;
  let totalSold = 0;
  let totalRewards = 0;
  let totalCostBasis = 0;
  let totalFeesPaid = 0;
  let highestBuyPrice = 0;
  let lowestBuyPrice = Infinity;
  let weightedPriceSum = 0;
  let weightedQtySum = 0;
  let firstTradeDate = Infinity;
  let lastTradeDate = 0;

  for (const tx of transactions) {
    if (tx.date < firstTradeDate) firstTradeDate = tx.date;
    if (tx.date > lastTradeDate) lastTradeDate = tx.date;

    if (tx.type === "reward") {
      totalRewardTransactions++;
      totalRewards += tx.quantity;
      continue;
    }

    // Approximate fee in USDT: if feeAsset is USDT, use directly; otherwise use price * fee as rough estimate
    const feeUsdt = tx.feeAsset === "USDT" ? tx.fee : tx.fee * tx.price;
    totalFeesPaid += feeUsdt;

    if (tx.type === "buy") {
      totalBuyTransactions++;
      totalBought += tx.quantity;
      totalCostBasis += tx.quoteAmount;
      weightedPriceSum += tx.price * tx.quantity;
      weightedQtySum += tx.quantity;
      if (tx.price > highestBuyPrice) highestBuyPrice = tx.price;
      if (tx.price < lowestBuyPrice) lowestBuyPrice = tx.price;
    } else {
      totalSellTransactions++;
      totalSold += tx.quantity;
    }
  }

  if (lowestBuyPrice === Infinity) lowestBuyPrice = 0;
  if (firstTradeDate === Infinity) firstTradeDate = 0;

  return {
    totalTransactions: transactions.length,
    totalBuyTransactions,
    totalSellTransactions,
    totalRewardTransactions,
    avgBuyPrice: weightedQtySum > 0 ? weightedPriceSum / weightedQtySum : 0,
    highestBuyPrice,
    lowestBuyPrice,
    totalFeesPaid,
    totalBought,
    totalSold,
    totalRewards,
    totalCostBasis,
    firstTradeDate,
    lastTradeDate,
  };
}
