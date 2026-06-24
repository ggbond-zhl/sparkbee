import type { InboundRequest } from "../../session/types";

export async function respondThenRunAcceptedCommand(
  request: InboundRequest,
  responsePayload: unknown,
  followUp: () => Promise<unknown>,
  options: {
    onFailure?(cause: unknown): void | Promise<void>;
  } = {},
): Promise<void> {
  await request.respond(responsePayload);

  try {
    await followUp();
  } catch (cause) {
    await options.onFailure?.(cause);
  }
}
