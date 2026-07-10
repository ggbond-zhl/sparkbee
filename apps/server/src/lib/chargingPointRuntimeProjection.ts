import type {
  RuntimeOperationResponse,
  RuntimeSnapshotResponse,
} from "@spark-bee/contracts";

import type { ChargingPointActorEvent } from "./chargingPointActor";

type RuntimeProjection = Omit<
  RuntimeSnapshotResponse,
  "chargingPointId" | "runtimeStatus"
>;

export class ChargingPointRuntimeProjection {
  private readonly projections = new Map<string, RuntimeProjection>();

  delete(chargingPointId: string): void {
    this.projections.delete(chargingPointId);
  }

  clear(chargingPointId: string): void {
    this.projections.set(chargingPointId, createEmptyProjection());
  }

  getRuntimeSnapshot(
    chargingPointId: string,
    runtimeStatus: RuntimeOperationResponse,
  ): RuntimeSnapshotResponse {
    const projection = runtimeStatus.status === "stopped"
      ? createEmptyProjection()
      : this.projections.get(chargingPointId) ?? createEmptyProjection();

    return {
      chargingPointId,
      runtimeStatus,
      sessionStatus: projection.sessionStatus,
      chargingPointStatus: projection.chargingPointStatus,
      chargingPointAvailability: projection.chargingPointAvailability,
      evseStatuses: [...projection.evseStatuses].sort((left, right) =>
        left.evseId - right.evseId
      ),
      connectorStatuses: [...projection.connectorStatuses].sort((left, right) =>
        left.evseId - right.evseId || left.connectorId - right.connectorId
      ),
      connectorAvailabilities: [...projection.connectorAvailabilities].sort(
        (left, right) =>
          left.evseId - right.evseId || left.connectorId - right.connectorId,
      ),
      transactionStatuses: [...projection.transactionStatuses].sort((left, right) =>
        left.transactionId.localeCompare(right.transactionId)
      ),
      lastHeartbeatAt: projection.lastHeartbeatAt,
      recentIssue: projection.recentIssue,
    };
  }

  projectActorEvent(event: ChargingPointActorEvent): void {
    const projection = this.projections.get(event.chargingPointId) ??
      createEmptyProjection();
    this.projections.set(
      event.chargingPointId,
      reduceRuntimeProjection(projection, event),
    );
  }
}

function createEmptyProjection(): RuntimeProjection {
  return {
    sessionStatus: null,
    chargingPointStatus: null,
    chargingPointAvailability: null,
    evseStatuses: [],
    connectorStatuses: [],
    connectorAvailabilities: [],
    transactionStatuses: [],
    lastHeartbeatAt: null,
    recentIssue: null,
  };
}

function reduceRuntimeProjection(
  projection: RuntimeProjection,
  event: ChargingPointActorEvent,
): RuntimeProjection {
  switch (event.type) {
    case "chargingPoint.lifecycle":
      return event.currentStatus === "stopped"
        ? createEmptyProjection()
        : withIssueFromEvent(projection, event);
    case "session.status":
      return reduceSessionStatus(projection, event);
    case "chargingPoint.availability":
      return reduceChargingPointAvailability(projection, event);
    case "chargingPoint.status":
      return reduceChargingPointStatus(projection, event);
    case "evse.status":
      return reduceEvseStatus(projection, event);
    case "connector.availability":
      return reduceConnectorAvailability(projection, event);
    case "connector.status":
      return reduceConnectorStatus(projection, event);
    case "authorization.status":
      return projection;
    case "transaction.status":
      return reduceTransactionStatus(projection, event);
    case "transaction.meterValue":
      return reduceTransactionMeterValue(projection, event);
    case "protocol.message":
      return event.direction === "received" && event.action === "Heartbeat"
        ? { ...projection, lastHeartbeatAt: event.occurredAt }
        : projection;
  }
}

function reduceChargingPointAvailability(
  projection: RuntimeProjection,
  event: Extract<ChargingPointActorEvent, { type: "chargingPoint.availability" }>,
): RuntimeProjection {
  return {
    ...projection,
    chargingPointAvailability: {
      currentAvailability: event.currentAvailability,
      ...(event.requestedAvailability === undefined
        ? {}
        : { requestedAvailability: event.requestedAvailability }),
      occurredAt: event.occurredAt,
    },
  };
}

function reduceSessionStatus(
  projection: RuntimeProjection,
  event: Extract<ChargingPointActorEvent, { type: "session.status" }>,
): RuntimeProjection {
  const nextProjection: RuntimeProjection = {
    ...projection,
    sessionStatus: {
      currentStatus: event.currentStatus,
      occurredAt: event.occurredAt,
      connectionUrl: event.connectionUrl,
      ...(event.attempt === undefined ? {} : { attempt: event.attempt }),
      ...(event.reason === undefined ? {} : { reason: event.reason }),
    },
  };

  if (event.error !== undefined) {
    return withIssue(nextProjection, {
      label: `${formatSessionStatus(event.currentStatus)}: ${event.error.message}`,
      tone: event.currentStatus === "reconnecting" ? "warning" : "destructive",
      occurredAt: event.occurredAt,
    });
  }

  if (event.currentStatus === "offline" && event.reason !== undefined) {
    return withIssueForOfflineReason(nextProjection, event);
  }

  return nextProjection;
}

function reduceChargingPointStatus(
  projection: RuntimeProjection,
  event: Extract<ChargingPointActorEvent, { type: "chargingPoint.status" }>,
): RuntimeProjection {
  const nextProjection: RuntimeProjection = {
    ...projection,
    chargingPointStatus: {
      currentStatus: event.currentStatus,
      occurredAt: event.occurredAt,
    },
  };

  if (event.error !== undefined) {
    return withIssue(nextProjection, {
      label: `桩状态异常: ${event.error.message}`,
      tone: "destructive",
      occurredAt: event.occurredAt,
    });
  }

  return event.currentStatus === "faulted"
    ? withIssue(nextProjection, {
        label: "桩状态故障",
        tone: "destructive",
        occurredAt: event.occurredAt,
      })
    : nextProjection;
}

function reduceEvseStatus(
  projection: RuntimeProjection,
  event: Extract<ChargingPointActorEvent, { type: "evse.status" }>,
): RuntimeProjection {
  const nextProjection: RuntimeProjection = {
    ...projection,
    evseStatuses: upsertByKey(
      projection.evseStatuses,
      String(event.resource.evseId),
      {
        evseId: event.resource.evseId,
        currentStatus: event.currentStatus,
        occurredAt: event.occurredAt,
      },
      (item) => String(item.evseId),
    ),
  };

  if (event.error !== undefined) {
    return withIssue(nextProjection, {
      label: `EVSE ${event.resource.evseId} 异常: ${event.error.message}`,
      tone: "destructive",
      occurredAt: event.occurredAt,
    });
  }

  return event.currentStatus === "faulted"
    ? withIssue(nextProjection, {
        label: `EVSE ${event.resource.evseId} 故障`,
        tone: "destructive",
        occurredAt: event.occurredAt,
      })
    : nextProjection;
}

function reduceConnectorStatus(
  projection: RuntimeProjection,
  event: Extract<ChargingPointActorEvent, { type: "connector.status" }>,
): RuntimeProjection {
  const key = connectorKey(event.resource.evseId, event.resource.connectorId);
  const nextProjection: RuntimeProjection = {
    ...projection,
    connectorStatuses: upsertByKey(
      projection.connectorStatuses,
      key,
      {
        evseId: event.resource.evseId,
        connectorId: event.resource.connectorId,
        currentStatus: event.currentStatus,
        occurredAt: event.occurredAt,
      },
      (item) => connectorKey(item.evseId, item.connectorId),
    ),
  };

  if (event.error !== undefined) {
    return withIssue(nextProjection, {
      label: `枪口 ${key} 异常: ${event.error.message}`,
      tone: "destructive",
      occurredAt: event.occurredAt,
    });
  }

  return event.currentStatus === "faulted"
    ? withIssue(nextProjection, {
        label: `枪口 ${key} 故障`,
        tone: "destructive",
        occurredAt: event.occurredAt,
      })
    : nextProjection;
}

function reduceConnectorAvailability(
  projection: RuntimeProjection,
  event: Extract<ChargingPointActorEvent, { type: "connector.availability" }>,
): RuntimeProjection {
  const key = connectorKey(event.resource.evseId, event.resource.connectorId);

  return {
    ...projection,
    connectorAvailabilities: upsertByKey(
      projection.connectorAvailabilities,
      key,
      {
        evseId: event.resource.evseId,
        connectorId: event.resource.connectorId,
        currentAvailability: event.currentAvailability,
        ...(event.requestedAvailability === undefined
          ? {}
          : { requestedAvailability: event.requestedAvailability }),
        occurredAt: event.occurredAt,
      },
      (item) => connectorKey(item.evseId, item.connectorId),
    ),
  };
}

function reduceTransactionStatus(
  projection: RuntimeProjection,
  event: Extract<ChargingPointActorEvent, { type: "transaction.status" }>,
): RuntimeProjection {
  const key = event.resource.transactionId ??
    connectorKey(event.resource.evseId, event.resource.connectorId);
  const previous = projection.transactionStatuses.find((item) =>
    item.transactionId === key
  );
  const nextProjection: RuntimeProjection = {
    ...projection,
    transactionStatuses: upsertByKey(
      projection.transactionStatuses,
      key,
      {
        transactionId: key,
        evseId: event.resource.evseId,
        connectorId: event.resource.connectorId,
        currentStatus: event.currentStatus,
        ...(event.reason === undefined ? {} : { reason: event.reason }),
        ...(previous?.meterWh === undefined ? {} : { meterWh: previous.meterWh }),
        ...(previous?.powerW === undefined ? {} : { powerW: previous.powerW }),
        ...(previous?.currentA === undefined ? {} : { currentA: previous.currentA }),
        ...(previous?.voltageV === undefined ? {} : { voltageV: previous.voltageV }),
        ...(previous?.sampledAt === undefined ? {} : { sampledAt: previous.sampledAt }),
        occurredAt: event.occurredAt,
      },
      (item) => item.transactionId,
    ),
  };

  if (event.error !== undefined) {
    return withIssue(nextProjection, {
      label: `交易失败: ${event.error.message}`,
      tone: "destructive",
      occurredAt: event.occurredAt,
    });
  }

  return event.currentStatus === "failed"
    ? withIssue(nextProjection, {
        label: event.reason === undefined ? "交易失败" : `交易失败: ${event.reason}`,
        tone: "destructive",
        occurredAt: event.occurredAt,
      })
    : nextProjection;
}

function reduceTransactionMeterValue(
  projection: RuntimeProjection,
  event: Extract<ChargingPointActorEvent, { type: "transaction.meterValue" }>,
): RuntimeProjection {
  const key = event.resource.transactionId;
  if (key === undefined) {
    return projection;
  }

  const previous = projection.transactionStatuses.find((item) =>
    item.transactionId === key
  );

  return {
    ...projection,
    transactionStatuses: upsertByKey(
      projection.transactionStatuses,
      key,
      {
        transactionId: key,
        evseId: event.resource.evseId,
        connectorId: event.resource.connectorId,
        currentStatus: previous?.currentStatus ?? "active",
        ...(previous?.reason === undefined ? {} : { reason: previous.reason }),
        meterWh: event.meterWh,
        powerW: event.powerW,
        currentA: event.currentA,
        voltageV: event.voltageV,
        sampledAt: event.sampledAt,
        occurredAt: event.occurredAt,
      },
      (item) => item.transactionId,
    ),
  };
}

function withIssueFromEvent(
  projection: RuntimeProjection,
  event: Extract<ChargingPointActorEvent, { type: "chargingPoint.lifecycle" }>,
) {
  return event.error === undefined
    ? projection
    : withIssue(projection, {
        label: `运行状态切换失败: ${event.error.message}`,
        tone: "destructive",
        occurredAt: event.occurredAt,
      });
}

function withIssue(
  projection: RuntimeProjection,
  issue: NonNullable<RuntimeProjection["recentIssue"]>,
): RuntimeProjection {
  return { ...projection, recentIssue: issue };
}

function withIssueForOfflineReason(
  projection: RuntimeProjection,
  event: Extract<ChargingPointActorEvent, { type: "session.status" }>,
) {
  if (event.reason === "intentional") {
    return projection;
  }

  return withIssue(projection, {
    label: event.reason === "reconnect_exhausted" ? "会话重连耗尽" : "会话意外断开",
    tone: event.reason === "reconnect_exhausted" ? "destructive" : "warning",
    occurredAt: event.occurredAt,
  });
}

function upsertByKey<TItem>(
  items: TItem[],
  key: string,
  nextItem: TItem,
  getKey: (item: TItem) => string,
) {
  const index = items.findIndex((item) => getKey(item) === key);
  if (index === -1) {
    return [...items, nextItem];
  }

  return [
    ...items.slice(0, index),
    nextItem,
    ...items.slice(index + 1),
  ];
}

function formatSessionStatus(status: "online" | "reconnecting" | "offline") {
  if (status === "online") {
    return "会话在线";
  }

  if (status === "reconnecting") {
    return "会话重连中";
  }

  return "会话离线";
}

function connectorKey(evseId: number, connectorId: number) {
  return `${evseId}/${connectorId}`;
}
