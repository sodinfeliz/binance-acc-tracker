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
  DcaDataPoint,
} from "./types";

// Wrapped/staked assets folded into their underlying asset (e.g. ETH staked as WBETH).
// Quantities convert at the current market price ratio so position value is preserved,
// while cost basis comes from the underlying asset's own buy history.
export const WRAPPED_ASSETS: Record<string, string> = {
  WBETH: "ETH",
};

export interface RawPortfolioInputs {
  balances: BinanceBalance[];
  tradesBySymbol: Record<string, BinanceTrade[]>;
  autoInvestByAsset: Record<string, BinanceAutoInvestTransaction[]>;
  dividendsByAsset: Record<string, BinanceAssetDividend[]>;
}

export function foldWrappedAssets(
  inputs: RawPortfolioInputs,
  prices: BinanceTickerPrice[]
): RawPortfolioInputs {
  const priceMap = new Map<string, number>();
  for (const p of prices) {
    priceMap.set(p.symbol, parseFloat(p.price));
  }

  const balances = inputs.balances.map((b) => ({ ...b }));
  const tradesBySymbol = { ...inputs.tradesBySymbol };
  const autoInvestByAsset = { ...inputs.autoInvestByAsset };
  const dividendsByAsset = { ...inputs.dividendsByAsset };

  for (const [wrapped, underlying] of Object.entries(WRAPPED_ASSETS)) {
    const wrappedPrice = priceMap.get(`${wrapped}USDT`);
    const underlyingPrice = priceMap.get(`${underlying}USDT`);
    // Without both prices the conversion rate is unknown; leave the asset as-is
    if (!wrappedPrice || !underlyingPrice) continue;
    const rate = wrappedPrice / underlyingPrice;

    const wSymbol = `${wrapped}USDT`;
    const uSymbol = `${underlying}USDT`;

    // Balance: convert to underlying-equivalent quantity and merge
    const wIdx = balances.findIndex((b) => b.asset === wrapped);
    if (wIdx >= 0) {
      const w = balances[wIdx];
      const equivFree = parseFloat(w.free) * rate;
      const equivLocked = parseFloat(w.locked) * rate;
      balances.splice(wIdx, 1);
      const u = balances.find((b) => b.asset === underlying);
      if (u) {
        u.free = (parseFloat(u.free) + equivFree).toString();
        u.locked = (parseFloat(u.locked) + equivLocked).toString();
      } else {
        balances.push({
          asset: underlying,
          free: equivFree.toString(),
          locked: equivLocked.toString(),
        });
      }
    }

    // Spot trades on the wrapped pair: convert qty, keep the USDT amount spent
    const wTrades = tradesBySymbol[wSymbol];
    if (wTrades) {
      const converted = wTrades.map((t) => {
        const qty = parseFloat(t.qty) * rate;
        const quoteQty = parseFloat(t.quoteQty);
        return {
          ...t,
          symbol: uSymbol,
          qty: qty.toString(),
          price: qty > 0 ? (quoteQty / qty).toString() : t.price,
          commission:
            t.commissionAsset === wrapped
              ? (parseFloat(t.commission) * rate).toString()
              : t.commission,
          commissionAsset: t.commissionAsset === wrapped ? underlying : t.commissionAsset,
        };
      });
      tradesBySymbol[uSymbol] = [...(tradesBySymbol[uSymbol] || []), ...converted];
      delete tradesBySymbol[wSymbol];
    }

    // Auto-invest plans targeting the wrapped asset
    const wAuto = autoInvestByAsset[wrapped];
    if (wAuto) {
      const converted = wAuto.map((tx) => {
        const target = parseFloat(tx.targetAssetAmount) * rate;
        const source = parseFloat(tx.sourceAssetAmount);
        return {
          ...tx,
          targetAsset: underlying,
          targetAssetAmount: target.toString(),
          executionPrice: target > 0 ? (source / target).toString() : tx.executionPrice,
        };
      });
      autoInvestByAsset[underlying] = [...(autoInvestByAsset[underlying] || []), ...converted];
      delete autoInvestByAsset[wrapped];
    }

    // Earn distributions paid in the wrapped asset
    const wDivs = dividendsByAsset[wrapped];
    if (wDivs) {
      const converted = wDivs.map((d) => ({
        ...d,
        asset: underlying,
        amount: (parseFloat(d.amount) * rate).toString(),
      }));
      dividendsByAsset[underlying] = [...(dividendsByAsset[underlying] || []), ...converted];
      delete dividendsByAsset[wrapped];
    }
  }

  return { balances, tradesBySymbol, autoInvestByAsset, dividendsByAsset };
}

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

export function computeDcaTimeline(transactions: UnifiedTransaction[]): DcaDataPoint[] {
  const spotBuys = transactions
    .filter((tx) => tx.source === "spot" && tx.type === "buy")
    .sort((a, b) => a.date - b.date);

  let totalInvested = 0;
  let totalQty = 0;

  return spotBuys.map((tx) => {
    totalInvested += tx.quoteAmount;
    totalQty += tx.quantity;
    return {
      date: tx.date,
      avgCost: totalQty > 0 ? totalInvested / totalQty : 0,
      totalInvested,
      totalQty,
    };
  });
}
