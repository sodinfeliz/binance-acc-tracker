import { NextRequest, NextResponse } from "next/server";
import { getAllTradesForSymbol } from "@/lib/binance";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");

  if (!symbol) {
    return NextResponse.json(
      { error: "symbol query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const trades = await getAllTradesForSymbol(symbol);
    return NextResponse.json(trades);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
