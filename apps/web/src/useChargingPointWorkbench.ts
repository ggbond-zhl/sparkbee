export interface ChargingPointWorkbench {
  authPanel: {
    authenticated: boolean | null;
    login(): Promise<void>;
    logout(): Promise<void>;
  };
  chargingPointList: {
    selectedId: string | null;
    chargingPoints: readonly unknown[];
    refresh(): Promise<void>;
    selectChargingPoint(id: string | null): void;
  };
  chargingPointEditor: {
    editing: boolean;
    createDraft(): void;
    save(): Promise<void>;
  };
  chargingPointDetail: {
    detail: unknown | null;
    start(): Promise<void>;
    stop(): Promise<void>;
    delete(): Promise<void>;
    plug(connectorId: number): Promise<void>;
    unplug(connectorId: number): Promise<void>;
  };
  transactionPanel: {
    activeTransactionId: string;
    authorize(): Promise<void>;
    startTransaction(): Promise<void>;
    reportMeterValue(): Promise<void>;
    stopTransaction(): Promise<void>;
  };
  eventTimeline: {
    events: readonly unknown[];
    protocolEvents: readonly unknown[];
  };
}

const noop = () => {};
const noopAsync = async () => {};

const emptyWorkbench: ChargingPointWorkbench = {
  authPanel: {
    authenticated: null,
    login: noopAsync,
    logout: noopAsync,
  },
  chargingPointList: {
    selectedId: null,
    chargingPoints: [],
    refresh: noopAsync,
    selectChargingPoint: noop,
  },
  chargingPointEditor: {
    editing: false,
    createDraft: noop,
    save: noopAsync,
  },
  chargingPointDetail: {
    detail: null,
    start: noopAsync,
    stop: noopAsync,
    delete: noopAsync,
    plug: noopAsync,
    unplug: noopAsync,
  },
  transactionPanel: {
    activeTransactionId: "",
    authorize: noopAsync,
    startTransaction: noopAsync,
    reportMeterValue: noopAsync,
    stopTransaction: noopAsync,
  },
  eventTimeline: {
    events: [],
    protocolEvents: [],
  },
};

export function useChargingPointWorkbench(): ChargingPointWorkbench {
  return emptyWorkbench;
}
