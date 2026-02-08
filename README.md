# Binance Account Tracker

A personal portfolio dashboard for tracking Binance spot holdings, earn positions, auto-invest plans, and DCA cost basis analysis. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- **Overview** — Total balance, PnL, and top holdings at a glance
- **Holdings** — Detailed table of all assets with current value, avg buy price, and unrealized PnL
- **Holding Detail** — Per-asset breakdown with price chart (lightweight-charts), trade markers, transaction history (spot, auto-invest, earn rewards)
- **DCA Analysis** — Cost basis over time for spot buys: running avg cost chart, stats cards, and buy history with per-transaction cost basis

## Prerequisites

- Node.js 18+
- A Binance account with API keys (read-only permissions are sufficient)

## Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/binance-acc-tracker.git
   cd binance-acc-tracker
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy the example env file and fill in your keys:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` with your Binance API credentials.

   > **Binance API key setup:** Go to [Binance API Management](https://www.binance.com/en/my/settings/api-management), create a new key, and enable **only "Read" permissions**. No trading or withdrawal access is needed.

4. **Run the development server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Production Build

```bash
npm run build
npm start
```

## API Routes

All data is fetched server-side through Next.js API routes — your API keys are never exposed to the browser.

| Route | Description |
|---|---|
| `/api/account` | Spot wallet balances |
| `/api/earn` | Simple Earn (flexible + locked) positions |
| `/api/trades` | Spot trade history per symbol |
| `/api/auto-invest` | Auto-invest / index plan transaction history |
| `/api/earn-rewards` | Earn dividend/reward history |
| `/api/prices` | Current ticker prices |
| `/api/klines` | Candlestick / price chart data |

## Tech Stack

- **Next.js 16** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS 4**
- **lightweight-charts** (TradingView) for price and cost basis charts
