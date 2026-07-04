import type { RuntimeOperationResponse } from "@spark-bee/contracts";
import { useEffect, useState } from "react";

import { subscribeChargingPointEvents } from "@/features/charging-points/api/chargingPoints";
import {
  createChargingPointRuntimeEventState,
  reduceChargingPointRuntimeEventState,
  type ChargingPointRuntimeEventState,
} from "@/features/charging-points/model/chargingPointRuntimeEvents";

export interface UseChargingPointRuntimeEventsOptions {
  enabled?: boolean;
  onRuntimeStatus?(runtimeStatus: RuntimeOperationResponse): void;
}

export function useChargingPointRuntimeEvents(
  chargingPointId: string,
  options: UseChargingPointRuntimeEventsOptions = {},
): ChargingPointRuntimeEventState {
  const enabled = options.enabled ?? true;
  const onRuntimeStatus = options.onRuntimeStatus;
  const [state, setState] = useState(createChargingPointRuntimeEventState);

  useEffect(() => {
    setState(createChargingPointRuntimeEventState());
    if (!enabled) {
      return undefined;
    }

    return subscribeChargingPointEvents(chargingPointId, {
      onEvent: (message) => {
        if (message.event === "snapshot") {
          onRuntimeStatus?.(message.data.runtimeStatus);
        }

        if (message.event === "chargingPoint.lifecycle") {
          onRuntimeStatus?.({
            chargingPointId: message.data.chargingPointId,
            status: message.data.currentStatus,
          });
        }

        setState((currentState) =>
          reduceChargingPointRuntimeEventState(currentState, message)
        );
      },
    });
  }, [chargingPointId, enabled, onRuntimeStatus]);

  return state;
}
