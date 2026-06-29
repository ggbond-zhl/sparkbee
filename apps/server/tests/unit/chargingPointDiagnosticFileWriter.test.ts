import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { ChargingPointDiagnosticFileWriter } from "../../src/lib/chargingPointDiagnosticFileWriter";

const tempDirs: string[] = [];

describe("ChargingPointDiagnosticFileWriter", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) =>
      rm(dir, { recursive: true, force: true })
    ));
  });

  test("writes charging point diagnostic records as JSON Lines", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sparkbee-diagnostics-"));
    tempDirs.push(directory);
    const writer = new ChargingPointDiagnosticFileWriter(directory);
    const sink = writer.createSink("cp/../1");

    await sink.write({
      id: "diagnostic-1",
      sequence: 1,
      chargingPointId: "cp/../1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      level: "info",
      code: "CHARGING_POINT_ACTOR_STATUS_CHANGED",
      message: "Charging point actor status changed",
      context: {
        currentStatus: "starting",
      },
    });
    await sink.write({
      id: "diagnostic-2",
      sequence: 2,
      chargingPointId: "cp/../1",
      occurredAt: "2026-01-01T00:00:01.000Z",
      level: "error",
      code: "DECODE_ERROR",
      message: "Charging point session reported diagnostic error",
    });

    const content = await readFile(join(directory, "cp-1.jsonl"), "utf8");

    expect(content.split("\n").filter(Boolean).map((line) => JSON.parse(line))).toEqual([
      {
        id: "diagnostic-1",
        sequence: 1,
        chargingPointId: "cp/../1",
        occurredAt: "2026-01-01T00:00:00.000Z",
        level: "info",
        code: "CHARGING_POINT_ACTOR_STATUS_CHANGED",
        message: "Charging point actor status changed",
        context: {
          currentStatus: "starting",
        },
      },
      {
        id: "diagnostic-2",
        sequence: 2,
        chargingPointId: "cp/../1",
        occurredAt: "2026-01-01T00:00:01.000Z",
        level: "error",
        code: "DECODE_ERROR",
        message: "Charging point session reported diagnostic error",
      },
    ]);
  });
});
