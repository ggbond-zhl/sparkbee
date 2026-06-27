import {
  Connector,
  type Availability,
  type ConnectorOptions,
  type ConnectorStatus,
} from "./Connector";
import {
  buildUniqueMap,
  cloneArray,
  cloneNullableDate,
  cloneOptionalDate,
  cloneSet,
} from "../shared/collections";
import { assertPositiveInteger } from "../shared/invariants";

export type EVSEStatus =
  | "available"
  | "occupied"
  | "reserved"
  | "unavailable"
  | "faulted";

export interface EVSEOptions {
  id: number;
  availability?: Availability;
  requestedAvailability?: Availability | null;
  activeTransactionId?: string | null;
  activeReservationId?: string | null;
  activeFaultIds?: Iterable<string>;
  connectors?: Iterable<Connector | ConnectorOptions>;
  lastStatusAt?: Date | null;
}

export class EVSE {
  readonly id: number;
  private _availability: Availability;
  private _requestedAvailability: Availability | null;
  private _activeTransactionId: string | null;
  private _activeReservationId: string | null;
  private readonly _activeFaultIds: Set<string>;
  private readonly connectors: Map<number, Connector>;
  private _lastStatusAt: Date | null;

  constructor(options: EVSEOptions) {
    assertPositiveInteger(options.id, "evse.id");

    const connectors = buildUniqueMap(
      cloneArray(options.connectors),
      (connector) => connector.id,
      (connectorId) => `connector ${connectorId} 已存在于 EVSE ${options.id}`,
    );

    this.id = options.id;
    this._availability = options.availability ?? "operative";
    this._requestedAvailability = options.requestedAvailability ?? null;
    this._activeTransactionId = options.activeTransactionId ?? null;
    this._activeReservationId = options.activeReservationId ?? null;
    this._activeFaultIds = cloneSet(options.activeFaultIds);
    this._lastStatusAt = cloneOptionalDate(options.lastStatusAt ?? null, "lastStatusAt") ?? null;
    this.connectors = new Map(
      [...connectors.entries()].map(([connectorId, connector]) => [
        connectorId,
        connector instanceof Connector ? connector : new Connector(connector),
      ]),
    );
  }

  get status(): EVSEStatus {
    if (this._activeFaultIds.size > 0) {
      return "faulted";
    }

    if (this._activeTransactionId !== null) {
      return "occupied";
    }

    if (this._activeReservationId !== null) {
      return "reserved";
    }

    if (this._availability === "inoperative") {
      return "unavailable";
    }

    return mapConnectorStatusToEvseStatus(
      this.listConnectors().map((connector) => connector.status),
    );
  }

  get availability(): Availability {
    return this._availability;
  }

  get requestedAvailability(): Availability | null {
    return this._requestedAvailability;
  }

  get activeTransactionId(): string | null {
    return this._activeTransactionId;
  }

  get activeReservationId(): string | null {
    return this._activeReservationId;
  }

  get lastStatusAt(): Date | null {
    return cloneNullableDate(this._lastStatusAt, "lastStatusAt");
  }

  listConnectors(): Connector[] {
    return [...this.connectors.values()];
  }

  listActiveFaultIds(): string[] {
    return cloneArray(this._activeFaultIds);
  }

  addConnector(connector: Connector): EVSE {
    if (this.connectors.has(connector.id)) {
      throw new Error(`connector ${connector.id} 已存在于 EVSE ${this.id}`);
    }

    return this.clone({
      connectors: [...this.listConnectors(), connector],
    });
  }

  getConnector(connectorId: number): Connector | undefined {
    return this.connectors.get(connectorId);
  }

  requestAvailability(nextAvailability: Availability): EVSE {
    return this.clone({
      requestedAvailability: nextAvailability,
    });
  }

  applyRequestedAvailability(at: Date): EVSE {
    if (this._requestedAvailability === null) {
      return this;
    }

    const nextAvailability = this._requestedAvailability;

    return this.clone({
      availability: nextAvailability,
      requestedAvailability: null,
      lastStatusAt: at,
    });
  }

  bindTransaction(transactionId: string, at: Date): EVSE {
    return this.clone({
      activeTransactionId: transactionId,
      lastStatusAt: at,
    });
  }

  releaseTransaction(at: Date): EVSE {
    return this.clone({
      activeTransactionId: null,
      lastStatusAt: at,
    });
  }

  reserve(reservationId: string, at: Date): EVSE {
    return this.clone({
      activeReservationId: reservationId,
      lastStatusAt: at,
    });
  }

  clearReservation(at: Date): EVSE {
    return this.clone({
      activeReservationId: null,
      lastStatusAt: at,
    });
  }

  activateFault(faultId: string, at: Date): EVSE {
    return this.clone({
      activeFaultIds: new Set([...this._activeFaultIds, faultId]),
      lastStatusAt: at,
    });
  }

  clearFault(faultId: string, at: Date): EVSE {
    const nextActiveFaultIds = cloneSet(this._activeFaultIds);
    nextActiveFaultIds.delete(faultId);

    return this.clone({
      activeFaultIds: nextActiveFaultIds,
      lastStatusAt: at,
    });
  }

  replaceConnector(nextConnector: Connector): EVSE {
    if (!this.connectors.has(nextConnector.id)) {
      throw new Error(`connector ${nextConnector.id} 不存在于 EVSE ${this.id}`);
    }

    return this.clone({
      connectors: this.listConnectors().map((connector) =>
        connector.id === nextConnector.id ? nextConnector : connector
      ),
    });
  }

  updateConnector(
    connectorId: number,
    updater: (connector: Connector) => Connector,
  ): EVSE {
    const connector = this.getConnector(connectorId);
    if (connector === undefined) {
      throw new Error(`connector ${connectorId} 不存在于 EVSE ${this.id}`);
    }

    return this.replaceConnector(updater(connector));
  }

  private clone(overrides: Partial<EVSEOptions>): EVSE {
    return new EVSE({
      id: this.id,
      availability: this._availability,
      requestedAvailability: this._requestedAvailability,
      activeTransactionId: this._activeTransactionId,
      activeReservationId: this._activeReservationId,
      activeFaultIds: this.listActiveFaultIds(),
      connectors: this.listConnectors(),
      lastStatusAt: this.lastStatusAt,
      ...overrides,
    });
  }

}

export function mapConnectorStatusToEvseStatus(
  statuses: ConnectorStatus[],
): EVSEStatus {
  if (statuses.includes("faulted")) {
    return "faulted";
  }

  if (statuses.includes("occupied")) {
    return "occupied";
  }

  if (statuses.includes("unavailable")) {
    return "unavailable";
  }

  return "available";
}
