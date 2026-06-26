import type { InboundRequest } from "../../../session/types";
import type { Ocpp16RuntimeContext } from "../state";
import { Ocpp16CommandDispatch } from "./Ocpp16CommandDispatch";

const dispatch = new Ocpp16CommandDispatch();

export async function handleInboundRequest(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
): Promise<void> {
  await dispatch.handle(context, request);
}
