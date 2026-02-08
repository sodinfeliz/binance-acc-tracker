import { NextRequest, NextResponse } from "next/server";
import { getCurrentPrices } from "@/lib/binance";

export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get("symbols");

  if (!symbolsParam) {
    return NextResponse.json(
      { error: "symbols query parameter is required" },
      { status: 400 }
    );
  }

  const symbols = symbolsParam.split(",").filter(Boolean);

  try {
    const prices = await getCurrentPrices(symbols);
    return NextResponse.json(prices);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
