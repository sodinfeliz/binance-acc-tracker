import { NextResponse } from "next/server";
import { getAutoInvestHistory } from "@/lib/binance";

export async function GET() {
  try {
    const transactions = await getAutoInvestHistory();
    return NextResponse.json(transactions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
