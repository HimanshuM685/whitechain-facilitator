import { NextResponse } from "next/server";
import { supported } from "@/lib/facilitator";

export const dynamic = "force-dynamic";

/**
 * GET /supported — scheme/network discovery. Both Whitechain networks are
 * advertised from this one URL, because x402 carries the network inside the
 * payment payload rather than in the facilitator endpoint.
 */
export async function GET() {
  return NextResponse.json(supported());
}
