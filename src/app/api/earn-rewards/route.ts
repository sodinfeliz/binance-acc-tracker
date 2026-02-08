import { NextResponse } from "next/server";
import { getAssetDividendHistory } from "@/lib/binance";

export async function GET() {
  try {
    const dividends = await getAssetDividendHistory();
    return NextResponse.json(dividends);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
