import { describe, expect, test } from "vitest";

import { ChargingPoint, Connector, EVSE } from "../../../../src/model/index.ts";
import { Ocpp16Codec } from "../../../../src/protocol/codec/index.ts";
import { Ocpp16Runtime } from "../../../../src/protocol/runtime/index.ts";
import type { Ocpp16RuntimeContext } from "../../../../src/protocol/runtime/ocpp16/state.ts";
import { ChargingPointSession } from "../../../../src/protocol/session/index.ts";
import type { ProtocolMessageEvent } from "../../../../src/protocol/session/types.ts";
import { Ocpp16Validator } from "../../../../src/protocol/validator/Ocpp16/Ocpp16Validator.ts";
import { MemoryTransport } from "../../session/testDoubles.ts";

describe("Ocpp16Runtime RemoteStopTransaction with real session validation", () => {
  test("sends StopTransaction with ceiled meterStop when the runtime meter is fractional", async () => {
    const transport = new MemoryTransport();
    const session = new ChargingPointSession({
      transport,
      codec: new Ocpp16Codec(),
      validator: new Ocpp16Validator(),
      outboundRequestPolicy: "serial",
    });
    const outboundRequests: ProtocolMessageEvent[] = [];
    session.on("protocolMessage", (event) => {
      if (event.direction !== "outbound" || event.messageKind !== "request") {
        return;
      }

      outboundRequests.push(event);
      setTimeout(() => {
        transport.emitMessage(JSON.stringify([
          3,
          event.messageId,
          createResponsePayload(event.action),
        ]));
      }, 0);
    });

    const runtime = new Ocpp16Runtime({
      session,
      chargingPoint: createChargingPoint(),
      clock: () => new Date("2026-06-12T09:20:39.453Z"),
      idGenerator: () => "local-tx-1",
    });

    await session.connect();
    await runtime.boot();
    await runtime.plugConnector({ evseId: 1, connectorId: 1 });
    await runtime.authorize({ connectorId: 1, idTag: "TAG001" });
    const start = await runtime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG001",
      meterStartWh: 100,
    });
    expect(start.status).toBe("Accepted");
    const transactionId = start.status === "Accepted" ? start.transactionId : "";
    const context = runtimeContext(runtime);
    const chargingTransaction = context.transactions.get(transactionId);
    expect(chargingTransaction).toBeDefined();
    context.transactions.set(
      transactionId,
      chargingTransaction!.recordMeterValue(100.5),
    );

    transport.emitMessage(JSON.stringify([
      2,
      "remote-stop-1",
      "RemoteStopTransaction",
      { transactionId: 1001 },
    ]));
    await waitForAsyncRequestHandling();

    const stopTransactionRequest = outboundRequests.find(
      (request) => request.action === "StopTransaction",
    );
    expect(stopTransactionRequest?.payload).toMatchObject({
      meterStop: 101,
      reason: "Remote",
      transactionId: 1001,
    });
    expect(context.transactions.get(transactionId)?.latestMeterWh).toBe(101);
  });
});

function createChargingPoint(): ChargingPoint {
  return new ChargingPoint({
    id: "cp-1",
    vendor: "Volt",
    model: "Sim",
    serialNumber: "CP001",
    firmwareVersion: "1.0.0",
    evses: [
      new EVSE({
        id: 1,
        connectors: [
          new Connector({
            id: 1,
            type: "GBT",
            format: "socket",
            powerType: "ac",
          }),
        ],
      }),
    ],
  });
}

function createResponsePayload(action: string | undefined): unknown {
  switch (action) {
    case "BootNotification":
      return {
        status: "Accepted",
        currentTime: "2026-06-12T09:20:00.000Z",
        interval: 30,
      };
    case "Authorize":
      return { idTagInfo: { status: "Accepted" } };
    case "StartTransaction":
      return { transactionId: 1001, idTagInfo: { status: "Accepted" } };
    default:
      return {};
  }
}

function runtimeContext(runtime: Ocpp16Runtime): Ocpp16RuntimeContext {
  return (runtime as unknown as { context: Ocpp16RuntimeContext }).context;
}

function waitForAsyncRequestHandling(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}
