import type { Ocpp16RuntimeContext } from "./state";

type Ocpp16RuntimeLogCategory = "action" | "command";
type Ocpp16RuntimeLogPhase =
  | "started"
  | "completed"
  | "rejected"
  | "failed";

type TraceOptions = {
  category: Ocpp16RuntimeLogCategory;
  name: string;
  input?: unknown;
  messageId?: string;
};

export function traceOcpp16RuntimeOperation<TResult>(
  context: Ocpp16RuntimeContext,
  options: TraceOptions,
  run: () => Promise<TResult>,
): Promise<TResult> {
  const operationId = context.nextRuntimeLogOperationId();
  const startedAt = context.clock();
  emitRuntimeLog(context, options, {
    phase: "started",
    operationId,
    input: options.input,
  });

  return run().then((result) => {
    emitRuntimeLog(context, options, {
      phase: classifyResult(result),
      operationId,
      input: options.input,
      result,
      durationMs: elapsedMs(startedAt, context.clock()),
    });
    return result;
  }, (cause) => {
    emitRuntimeLog(context, options, {
      phase: "failed",
      operationId,
      input: options.input,
      error: toLogError(cause),
      durationMs: elapsedMs(startedAt, context.clock()),
    });
    throw cause;
  });
}

export function traceOcpp16RuntimeCommandStarted(
  context: Ocpp16RuntimeContext,
  input: {
    name: string;
    messageId: string;
    payload: unknown;
  },
): {
  operationId: string;
  startedAt: Date;
} {
  const operationId = context.nextRuntimeLogOperationId();
  const startedAt = context.clock();
  emitRuntimeLog(context, {
    category: "command",
    name: input.name,
    messageId: input.messageId,
    input: input.payload,
  }, {
    phase: "started",
    operationId,
    input: input.payload,
  });

  return { operationId, startedAt };
}

export function emitOcpp16RuntimeCommandResult(
  context: Ocpp16RuntimeContext,
  input: {
    name: string;
    messageId: string;
    operationId: string;
    startedAt: Date;
    requestPayload: unknown;
    phase: Exclude<Ocpp16RuntimeLogPhase, "started">;
    responsePayload?: unknown;
    error?: unknown;
  },
): void {
  emitRuntimeLog(context, {
    category: "command",
    name: input.name,
    messageId: input.messageId,
  }, {
    phase: input.phase,
    operationId: input.operationId,
    input: input.requestPayload,
    responsePayload: input.responsePayload,
    error: input.error === undefined ? undefined : toLogError(input.error),
    durationMs: elapsedMs(input.startedAt, context.clock()),
  });
}

function emitRuntimeLog(
  context: Ocpp16RuntimeContext,
  options: TraceOptions,
  input: {
    phase: Ocpp16RuntimeLogPhase;
    operationId: string;
    input?: unknown;
    result?: unknown;
    responsePayload?: unknown;
    error?: unknown;
    durationMs?: number;
  },
): void {
  const code = toCode(options.category, input.phase);
  context.emitRuntimeLog({
    level: toLevel(input.phase),
    code,
    message: toMessage(options.category, input.phase),
    context: {
      category: options.category,
      phase: input.phase,
      operationId: input.operationId,
      name: options.name,
      ...(options.messageId === undefined ? {} : { messageId: options.messageId }),
      ...(input.input === undefined ? {} : { input: input.input }),
      ...(input.result === undefined ? {} : { result: input.result }),
      ...(input.responsePayload === undefined
        ? {}
        : { responsePayload: input.responsePayload }),
      ...(input.error === undefined ? {} : { error: input.error }),
      ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    },
  });
}

function classifyResult(result: unknown): Exclude<Ocpp16RuntimeLogPhase, "started"> {
  const outcome = getResultStatus(result);
  if (outcome === "Rejected" || outcome === "rejected") {
    return "rejected";
  }
  if (outcome === "Failed" || outcome === "failed") {
    return "failed";
  }

  return "completed";
}

function getResultStatus(result: unknown): unknown {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }

  if ("status" in result) {
    return result.status;
  }
  if ("outcome" in result) {
    return result.outcome;
  }

  return undefined;
}

function elapsedMs(startedAt: Date, completedAt: Date): number {
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

function toCode(
  category: Ocpp16RuntimeLogCategory,
  phase: Ocpp16RuntimeLogPhase,
): string {
  return `OCPP16_${category.toUpperCase()}_${phase.toUpperCase()}`;
}

function toMessage(
  category: Ocpp16RuntimeLogCategory,
  phase: Ocpp16RuntimeLogPhase,
): string {
  return `OCPP 1.6 ${category} ${phase}`;
}

function toLevel(phase: Ocpp16RuntimeLogPhase): "info" | "warn" | "error" {
  if (phase === "failed") {
    return "error";
  }
  if (phase === "rejected") {
    return "warn";
  }

  return "info";
}

function toLogError(cause: unknown): { name?: string; code?: string; message: string } {
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      ...("code" in cause && typeof cause.code === "string"
        ? { code: cause.code }
        : {}),
    };
  }

  return { message: String(cause) };
}
