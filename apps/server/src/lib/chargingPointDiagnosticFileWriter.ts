import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type {
  ChargingPointActorDiagnosticRecord,
  ChargingPointActorDiagnosticSink,
} from "./chargingPointActor";

export class ChargingPointDiagnosticFileWriter {
  constructor(private readonly directory: string) {}

  createSink(chargingPointId: string): ChargingPointActorDiagnosticSink {
    return new ChargingPointDiagnosticFileSink(
      this.directory,
      toSafeChargingPointFileStem(chargingPointId),
    );
  }
}

class ChargingPointDiagnosticFileSink implements ChargingPointActorDiagnosticSink {
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(
    private readonly directory: string,
    private readonly fileStem: string,
  ) {}

  write(record: ChargingPointActorDiagnosticRecord): Promise<void> {
    this.pendingWrite = this.pendingWrite.then(
      () => this.appendRecord(record),
      () => this.appendRecord(record),
    );

    return this.pendingWrite;
  }

  private async appendRecord(record: ChargingPointActorDiagnosticRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await appendFile(
      join(this.directory, `${this.fileStem}.jsonl`),
      `${JSON.stringify(record)}\n`,
      "utf8",
    );
  }
}

function toSafeChargingPointFileStem(chargingPointId: string): string {
  const fileStem = chargingPointId
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return fileStem.length === 0 ? "charging-point" : fileStem;
}
