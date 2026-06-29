import type { ProtocolClock } from "../../protocol/runtime/ocpp16/protocolClock";
import type {
  ChargingPointActorDiagnosticLevel,
  ChargingPointActorDiagnosticRecord,
  ChargingPointActorDiagnosticSink,
} from "../types";

export class DiagnosticRecordPublisher {
  private sequence = 0;

  constructor(
    private readonly options: {
      chargingPointId: string;
      clock: ProtocolClock;
      idGenerator: () => string;
      sink?: ChargingPointActorDiagnosticSink;
    },
  ) {}

  publish(input: {
    level: ChargingPointActorDiagnosticLevel;
    message: string;
    code?: string;
    context?: Record<string, unknown>;
  }): void {
    if (this.options.sink === undefined) {
      return;
    }

    this.sequence += 1;
    const record: ChargingPointActorDiagnosticRecord = {
      id: this.options.idGenerator(),
      sequence: this.sequence,
      chargingPointId: this.options.chargingPointId,
      occurredAt: this.options.clock.now().toISOString(),
      level: input.level,
      message: input.message,
      ...(input.code === undefined ? {} : { code: input.code }),
      ...(input.context === undefined ? {} : { context: input.context }),
    };

    try {
      const result = this.options.sink.write(record);
      if (result !== undefined) {
        void Promise.resolve(result).catch(() => undefined);
      }
    } catch {
      // Diagnostics are observers and must not affect charging point execution.
    }
  }
}
