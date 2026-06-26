export interface StationWorkbench {
  authPanel: {
    authenticated: boolean | null;
    login(): Promise<void>;
    logout(): Promise<void>;
  };
  stationList: {
    selectedId: string | null;
    stations: readonly unknown[];
    refresh(): Promise<void>;
    selectStation(id: string | null): void;
  };
  stationEditor: {
    editing: boolean;
    createDraft(): void;
    save(): Promise<void>;
  };
  stationDetail: {
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

const emptyWorkbench: StationWorkbench = {
  authPanel: {
    authenticated: null,
    login: noopAsync,
    logout: noopAsync,
  },
  stationList: {
    selectedId: null,
    stations: [],
    refresh: noopAsync,
    selectStation: noop,
  },
  stationEditor: {
    editing: false,
    createDraft: noop,
    save: noopAsync,
  },
  stationDetail: {
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

export function useStationWorkbench(): StationWorkbench {
  return emptyWorkbench;
}
