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
  onRuntimeStatus?(runtimeStatus: RuntimeOperationResponse): void;
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
  const onRuntimeStatus = options.onRuntimeStatus;
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
        const runtimeStatus = toRuntimeStatusFromStreamMessage(message);
        if (runtimeStatus !== null) {
          onRuntimeStatus?.(runtimeStatus);
        }

        setRuntimeEventState((currentState) =>
          reduceChargingPointRuntimeEventState(currentState, message)
        );
        setEventFeedState((currentState) =>
          reduceChargingPointRuntimeEventFeedState(currentState, message)
        );
      },
    });
  }, [chargingPointId, enabled, onRuntimeStatus]);

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
      };
    }

    return {
      chargingPointId: message.data.chargingPointId,
      status: message.data.status === "Accepted"
        ? "running"
        : "starting",
      bootStatus: message.data.status,
      ...(message.data.retryAfterSec === undefined
        ? {}
        : { retryAfterSec: message.data.retryAfterSec }),
    };
  }

  return null;
}
