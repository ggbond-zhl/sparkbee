import type { InboundRequest } from "../../../session/types";
import type { Ocpp16RuntimeContext } from "../state";
import { handleChangeAvailability } from "./changeAvailability";
import { handleChangeConfiguration } from "./changeConfiguration";
import { handleClearCache } from "./clearCache";
import { handleGetConfiguration } from "./getConfiguration";
import { handleGetLocalListVersion } from "./getLocalListVersion";
import { handleRemoteStartTransaction } from "./remoteStartTransaction";
import { handleRemoteStopTransaction } from "./remoteStopTransaction";
import { handleSendLocalList } from "./sendLocalList";
import { handleTriggerMessage } from "./triggerMessage";
import { handleUnlockConnector } from "./unlockConnector";

type Ocpp16CommandHandler = (
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
) => Promise<void>;

const handlers: Record<string, Ocpp16CommandHandler> = {
  ChangeAvailability: handleChangeAvailability,
  ChangeConfiguration: handleChangeConfiguration,
  ClearCache: handleClearCache,
  GetConfiguration: handleGetConfiguration,
  GetLocalListVersion: handleGetLocalListVersion,
  RemoteStartTransaction: handleRemoteStartTransaction,
  RemoteStopTransaction: handleRemoteStopTransaction,
  SendLocalList: handleSendLocalList,
  TriggerMessage: handleTriggerMessage,
  UnlockConnector: handleUnlockConnector,
};

export class Ocpp16CommandDispatch {
  handle(
    context: Ocpp16RuntimeContext,
    request: InboundRequest,
  ): Promise<void> {
    const handler = handlers[request.action];
    if (handler === undefined) {
      return request.reject("NotSupported", `${request.action} 暂不支持`);
    }

    return handler(context, request);
  }
}
