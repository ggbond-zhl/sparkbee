import type { InboundRequest } from "../../../session/types";
import type { Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import type { Ocpp16RuntimeContext } from "../state";
import { clearAuthorizationCache } from "../AuthorizationDecision";

export async function handleClearCache(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
): Promise<void> {
  clearAuthorizationCache(context);

  await request.respond({
    status: "Accepted",
  } satisfies Ocpp16ResponseOf<"ClearCache">);
}
