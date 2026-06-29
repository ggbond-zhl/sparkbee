import type { InboundRequest } from "../../../session/types";
import type { Ocpp16RuntimeContext } from "../state";
import {
  emitOcpp16RuntimeCommandResult,
  traceOcpp16RuntimeCommandStarted,
} from "../diagnostics";
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
  async handle(
    context: Ocpp16RuntimeContext,
    request: InboundRequest,
  ): Promise<void> {
    const trace = traceOcpp16RuntimeCommandStarted(context, {
      name: request.action,
      messageId: request.messageId,
      payload: request.payload,
    });
    const handler = handlers[request.action];
    if (handler === undefined) {
      const responsePayload = {
        errorCode: "NotSupported",
        message: `${request.action} 暂不支持`,
      };
      try {
        await request.reject(responsePayload.errorCode, responsePayload.message);
        emitOcpp16RuntimeCommandResult(context, {
          name: request.action,
          messageId: request.messageId,
          operationId: trace.operationId,
          startedAt: trace.startedAt,
          requestPayload: request.payload,
          phase: "rejected",
          responsePayload,
        });
      } catch (cause) {
        emitOcpp16RuntimeCommandResult(context, {
          name: request.action,
          messageId: request.messageId,
          operationId: trace.operationId,
          startedAt: trace.startedAt,
          requestPayload: request.payload,
          phase: "failed",
          responsePayload,
          error: cause,
        });
        throw cause;
      }
      return;
    }

    let terminalEmitted = false;
    const tracedRequest: InboundRequest = {
      action: request.action,
      payload: request.payload,
      messageId: request.messageId,
      respond: async (payload) => {
        await request.respond(payload);
        terminalEmitted = true;
        emitOcpp16RuntimeCommandResult(context, {
          name: request.action,
          messageId: request.messageId,
          operationId: trace.operationId,
          startedAt: trace.startedAt,
          requestPayload: request.payload,
          phase: classifyCommandResponse(payload),
          responsePayload: payload,
        });
      },
      reject: async (errorCode, message, details) => {
        const responsePayload = { errorCode, message, details };
        await request.reject(errorCode, message, details);
        terminalEmitted = true;
        emitOcpp16RuntimeCommandResult(context, {
          name: request.action,
          messageId: request.messageId,
          operationId: trace.operationId,
          startedAt: trace.startedAt,
          requestPayload: request.payload,
          phase: "failed",
          responsePayload,
        });
      },
    };

    try {
      await handler(context, tracedRequest);
      if (!terminalEmitted) {
        emitOcpp16RuntimeCommandResult(context, {
          name: request.action,
          messageId: request.messageId,
          operationId: trace.operationId,
          startedAt: trace.startedAt,
          requestPayload: request.payload,
          phase: "completed",
        });
      }
    } catch (cause) {
      if (!terminalEmitted) {
        emitOcpp16RuntimeCommandResult(context, {
          name: request.action,
          messageId: request.messageId,
          operationId: trace.operationId,
          startedAt: trace.startedAt,
          requestPayload: request.payload,
          phase: "failed",
          error: cause,
        });
      }
      throw cause;
    }
  }
}

function classifyCommandResponse(payload: unknown): "completed" | "rejected" {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "status" in payload &&
    (
      payload.status === "Rejected" ||
      payload.status === "NotSupported" ||
      payload.status === "NotImplemented"
    )
  ) {
    return "rejected";
  }

  return "completed";
}
