import { NextResponse } from "next/server";
import { getAccountBalances } from "@/lib/binance";

export async function GET() {
  try {
    const balances = await getAccountBalances();
    return NextResponse.json(balances);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
