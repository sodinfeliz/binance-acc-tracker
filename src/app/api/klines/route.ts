import { NextRequest, NextResponse } from "next/server";
import { publicRequest } from "@/lib/binance";
import { BinanceKlineRaw, KlineDataPoint } from "@/lib/types";

const ALLOWED_INTERVALS = new Set([
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") || "1d";
  const limit = searchParams.get("limit") || "500";

  if (!symbol) {
    return NextResponse.json(
      { error: "symbol query parameter is required" },
      { status: 400 }
    );
  }

  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json(
      { error: `Invalid interval: ${interval}` },
      { status: 400 }
    );
  }

  try {
    const raw = await publicRequest<BinanceKlineRaw[]>("/api/v3/klines", {
      symbol,
      interval,
      limit,
    });

    const data: KlineDataPoint[] = raw.map((k) => ({
      time: Math.floor(k[0] / 1000), // ms → seconds
      value: parseFloat(k[4]), // close price
    }));

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
