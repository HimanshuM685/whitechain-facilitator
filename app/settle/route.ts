import { NextResponse, type NextRequest } from "next/server";
import { facilitatorFor } from "@/lib/facilitator";
import { parseFacilitatorRequest, preflightResponse, errorResponse } from "@/lib/route-helpers";
import { preflight } from "@/lib/guards";
import { NETWORKS } from "@/lib/networks";

export const dynamic = "force-dynamic";
// A settle waits for a receipt; Whitechain blocks are 1s, but allow for a slow one.
export const maxDuration = 60;

/**
 * POST /settle — submits the payer's signed authorization on-chain and pays the
 * WBT fee. The payer's funds move directly to `payTo`; this service never holds
 * them and can only broadcast the signature or decline to.
 */
export async function POST(request: NextRequest) {
  const parsed = await parseFacilitatorRequest(request);
  if ("error" in parsed) return parsed.error;
  const { net, payload, requirements, ip } = parsed;

  const gate = await preflight({
    net,
    phase: "settle",
    ip,
    scheme: requirements.scheme,
    network: requirements.network,
    asset: requirements.asset,
    amount: requirements.amount,
    payTo: requirements.payTo,
  });

  if (gate.kind !== "ok") {
    return preflightResponse(gate, (reason, message) =>
      NextResponse.json({
        success: false,
        errorReason: reason,
        errorMessage: message,
        transaction: "",
        network: NETWORKS[net].caip2,
      }),
    );
  }

  try {
    return NextResponse.json(await facilitatorFor(net).settle(payload, requirements));
  } catch (error) {
    return errorResponse("settle", error, (reason, message) =>
      NextResponse.json(
        { success: false, errorReason: reason, errorMessage: message, transaction: "", network: NETWORKS[net].caip2 },
        { status: 500 },
      ),
    );
  }
}
