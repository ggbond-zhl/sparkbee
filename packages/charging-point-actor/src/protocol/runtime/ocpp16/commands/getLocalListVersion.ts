import type { InboundRequest } from "../../../session/types";
import type { Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import type { Ocpp16RuntimeContext } from "../state";

export async function handleGetLocalListVersion(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
): Promise<void> {
  await request.respond({
    listVersion: resolveListVersion(context),
  } satisfies Ocpp16ResponseOf<"GetLocalListVersion">);
}

function resolveListVersion(context: Ocpp16RuntimeContext): number {
  if (!context.configurationFacts.supportsLocalAuthorizationList()) {
    return -1;
  }

  return context.localAuthorizationList.version;
}
