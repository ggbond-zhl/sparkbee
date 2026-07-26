import type { InboundRequest } from "../../../session/types";
import type { Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import type { Ocpp16RuntimeContext } from "../state";
import { getOcpp16AuthorizationPolicy } from "../Ocpp16AuthorizationPolicy";

export async function handleClearCache(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
): Promise<void> {
  await getOcpp16AuthorizationPolicy(context).clearCache();

  await request.respond({
    status: "Accepted",
  } satisfies Ocpp16ResponseOf<"ClearCache">);
}
