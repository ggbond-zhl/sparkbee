import type { RuntimeOperationResponse } from "@spark-bee/contracts";
import { useEffect, useState } from "react";

import { subscribeChargingPointEvents } from "@/features/charging-points/api/chargingPoints";
import {
  createChargingPointRuntimeEventFeedState,
  createChargingPointRuntimeEventState,
  reduceChargingPointRuntimeEventFeedState,
  reduceChargingPointRuntimeEventState,
  type ChargingPointEventStreamMessage,
  type ChargingPointRuntimeEventFeedState,
  type ChargingPointRuntimeEventState,
} from "@/features/charging-points/model/chargingPointRuntimeEvents";

export interface UseChargingPointRuntimeEventsOptions {
  enabled?: boolean;
  onEvent?(message: ChargingPointEventStreamMessage): void;
  onRuntimeStatus?(runtimeStatus: RuntimeOperationResponse): void;
  onSnapshot?(): void;
}

export interface UseChargingPointRuntimeEventsResult {
  runtimeEventState: ChargingPointRuntimeEventState;
  eventFeedState: ChargingPointRuntimeEventFeedState;
}

export function useChargingPointRuntimeEvents(
  chargingPointId: string,
  options: UseChargingPointRuntimeEventsOptions = {},
): UseChargingPointRuntimeEventsResult {
  const enabled = options.enabled ?? true;
  const onEvent = options.onEvent;
  const onRuntimeStatus = options.onRuntimeStatus;
  const onSnapshot = options.onSnapshot;
  const [runtimeEventState, setRuntimeEventState] = useState(
    createChargingPointRuntimeEventState,
  );
  const [eventFeedState, setEventFeedState] = useState(
    createChargingPointRuntimeEventFeedState,
  );

  useEffect(() => {
    setRuntimeEventState(createChargingPointRuntimeEventState());
    setEventFeedState(createChargingPointRuntimeEventFeedState());
    if (!enabled) {
      return undefined;
    }

    return subscribeChargingPointEvents(chargingPointId, {
      onEvent: (message) => {
        if (message.event === "snapshot") {
          onSnapshot?.();
        }
        const runtimeStatus = toRuntimeStatusFromStreamMessage(message);
        if (runtimeStatus !== null) {
          onRuntimeStatus?.(runtimeStatus);
        }
        onEvent?.(message);

        setRuntimeEventState((currentState) =>
          reduceChargingPointRuntimeEventState(currentState, message)
        );
        setEventFeedState((currentState) =>
          reduceChargingPointRuntimeEventFeedState(currentState, message)
        );
      },
    });
  }, [chargingPointId, enabled, onEvent, onRuntimeStatus, onSnapshot]);

  return {
    runtimeEventState,
    eventFeedState,
  };
}

export function toRuntimeStatusFromStreamMessage(
  message: ChargingPointEventStreamMessage,
): RuntimeOperationResponse | null {
  if (message.event === "snapshot") {
    return message.data.runtimeStatus;
  }

  if (message.event === "chargingPoint.boot") {
    if (message.data.status === "Rejected") {
      return {
        chargingPointId: message.data.chargingPointId,
        status: "stopped",
        runningIntent: "running",
      };
    }

    return {
      chargingPointId: message.data.chargingPointId,
      status: message.data.status === "Accepted"
        ? "running"
        : "starting",
      runningIntent: "running",
      bootStatus: message.data.status,
      ...(message.data.retryAfterSec === undefined
        ? {}
        : { retryAfterSec: message.data.retryAfterSec }),
    };
  }

  return null;
}
