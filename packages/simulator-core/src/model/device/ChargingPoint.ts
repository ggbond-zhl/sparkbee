import { EVSE, type EVSEOptions } from "./EVSE";
import { type Availability, type Connector } from "./Connector";
import {
  buildUniqueMap,
  cloneArray,
  cloneNullableDate,
  cloneOptionalDate,
  cloneSet,
} from "../shared/collections";

export type ChargingPointStatus = "available" | "unavailable" | "faulted";

export interface ChargingPointOptions {
  id: string;
  vendor: string;
  model: string;
  firmwareVersion?: string;
  serialNumber?: string;
  availability?: Availability;
  requestedAvailability?: Availability | null;
  faultCode?: string | null;
  activeFaultIds?: Iterable<string>;
  lastStatusAt?: Date | null;
  evses?: Iterable<EVSE | EVSEOptions>;
}

export class ChargingPoint {
  readonly id: string;
  readonly vendor: string;
  readonly model: string;
  readonly firmwareVersion?: string;
  readonly serialNumber?: string;
  private _availability: Availability;
  private _requestedAvailability: Availability | null;
  private _faultCode: string | null;
  private readonly _activeFaultIds: Set<string>;
  private _lastStatusAt: Date | null;
  private readonly evses: Map<number, EVSE>;

  constructor(options: ChargingPointOptions) {
    const evses = buildUniqueMap(
      cloneArray(options.evses),
      (evse) => evse.id,
      (evseId) => `EVSE ${evseId} 已存在于 charging point ${options.id}`,
    );

    this.id = options.id;
    this.vendor = options.vendor;
    this.model = options.model;
    this.firmwareVersion = options.firmwareVersion;
    this.serialNumber = options.serialNumber;
    this._availability = options.availability ?? "inoperative";
    this._requestedAvailability = options.requestedAvailability ?? null;
    this._faultCode = options.faultCode ?? null;
    this._activeFaultIds = cloneSet(options.activeFaultIds);
    this._lastStatusAt = cloneOptionalDate(options.lastStatusAt ?? null, "lastStatusAt") ?? null;
    this.evses = new Map(
      [...evses.entries()].map(([evseId, evse]) => [
        evseId,
        evse instanceof EVSE ? evse : new EVSE(evse),
      ]),
    );
  }

  get status(): ChargingPointStatus {
    if (this._activeFaultIds.size > 0) {
      return "faulted";
    }

    return this._availability === "inoperative" ? "unavailable" : "available";
  }

  get availability(): Availability {
    return this._availability;
  }

  get requestedAvailability(): Availability | null {
    return this._requestedAvailability;
  }

  get faultCode(): string | null {
    return this._faultCode;
  }

  get lastStatusAt(): Date | null {
    return cloneNullableDate(this._lastStatusAt, "lastStatusAt");
  }

  listActiveFaultIds(): string[] {
    return cloneArray(this._activeFaultIds);
  }

  listEvses(): EVSE[] {
    return [...this.evses.values()];
  }

  addEvse(evse: EVSE): ChargingPoint {
    if (this.evses.has(evse.id)) {
      throw new Error(`EVSE ${evse.id} 已存在于 charging point ${this.id}`);
    }

    return this.clone({
      evses: [...this.listEvses(), evse],
    });
  }

  getEvse(evseId: number): EVSE | undefined {
    return this.evses.get(evseId);
  }

  getConnector(evseId: number, connectorId: number): Connector | undefined {
    return this.evses.get(evseId)?.getConnector(connectorId);
  }

  requestAvailability(nextAvailability: Availability): ChargingPoint {
    return this.clone({
      requestedAvailability: nextAvailability,
    });
  }

  applyRequestedAvailability(at: Date): ChargingPoint {
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

  markOperative(at: Date): ChargingPoint {
    return this.clone({
      availability: "operative",
      requestedAvailability: null,
      lastStatusAt: at,
    });
  }

  activateFault(faultId: string, faultCode: string, at: Date): ChargingPoint {
    return this.clone({
      activeFaultIds: new Set([...this._activeFaultIds, faultId]),
      faultCode,
      lastStatusAt: at,
    });
  }

  clearFault(faultId: string, at: Date): ChargingPoint {
    const nextActiveFaultIds = cloneSet(this._activeFaultIds);
    nextActiveFaultIds.delete(faultId);

    return this.clone({
      activeFaultIds: nextActiveFaultIds,
      faultCode: nextActiveFaultIds.size === 0 ? null : this._faultCode,
      lastStatusAt: at,
    });
  }

  replaceEvse(nextEvse: EVSE): ChargingPoint {
    if (!this.evses.has(nextEvse.id)) {
      throw new Error(`EVSE ${nextEvse.id} 不存在于 charging point ${this.id}`);
    }

    return this.clone({
      evses: this.listEvses().map((evse) =>
        evse.id === nextEvse.id ? nextEvse : evse
      ),
    });
  }

  updateEvse(evseId: number, updater: (evse: EVSE) => EVSE): ChargingPoint {
    const evse = this.getEvse(evseId);
    if (evse === undefined) {
      throw new Error(`EVSE ${evseId} 不存在于 charging point ${this.id}`);
    }

    return this.replaceEvse(updater(evse));
  }

  updateConnector(
    evseId: number,
    connectorId: number,
    updater: (connector: Connector) => Connector,
  ): ChargingPoint {
    return this.updateEvse(evseId, (evse) => evse.updateConnector(connectorId, updater));
  }

  private clone(overrides: Partial<ChargingPointOptions>): ChargingPoint {
    return new ChargingPoint({
      id: this.id,
      vendor: this.vendor,
      model: this.model,
      firmwareVersion: this.firmwareVersion,
      serialNumber: this.serialNumber,
      availability: this._availability,
      requestedAvailability: this._requestedAvailability,
      faultCode: this._faultCode,
      activeFaultIds: this.listActiveFaultIds(),
      lastStatusAt: this.lastStatusAt,
      evses: this.listEvses(),
      ...overrides,
    });
  }

}
