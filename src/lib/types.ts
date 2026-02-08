// Binance API response types

export interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface BinanceAccountResponse {
  balances: BinanceBalance[];
}

export interface BinanceTrade {
  id: number;
  symbol: string;
  orderId: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
}

export interface BinanceTickerPrice {
  symbol: string;
  price: string;
}

export interface BinanceFlexiblePosition {
  asset: string;
  totalAmount: string;
  productId: string;
}

export interface BinanceLockedPosition {
  asset: string;
  amount: string;
  positionId: number;
}

export interface BinanceEarnResponse<T> {
  rows: T[];
  total: number;
}

// App types

export interface CryptoHolding {
  asset: string;
  symbol: string; // e.g. "BTCUSDT"
  quantity: number;
  avgBuyCost: number;
  totalInvested: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPnL: number;
  pnlPercent: number;
}

export interface PortfolioData {
  holdings: CryptoHolding[];
  totalInvested: number;
  totalCurrentValue: number;
  totalPnL: number;
  totalPnLPercent: number;
}
