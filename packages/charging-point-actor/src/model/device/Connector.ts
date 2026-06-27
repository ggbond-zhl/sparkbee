import {
  cloneArray,
  cloneNullableDate,
  cloneOptionalDate,
  cloneSet,
} from "../shared/collections";
import {
  assertNonNegativeFiniteNumber,
  assertPositiveInteger,
} from "../shared/invariants";

export type ConnectorFormat = "socket" | "cable" | "unknown";
export type ConnectorPowerType = "ac" | "dc" | "unknown";
export type ConnectorPlugState = "unplugged" | "plugged" | "unknown";
export type ConnectorVehiclePresence = "unknown" | "detected" | "absent";
export type ConnectorLockState =
  | "locked"
  | "unlocked"
  | "unlocking"
  | "unknown";
export type Availability = "operative" | "inoperative";
export type ConnectorStatus =
  | "available"
  | "occupied"
  | "unavailable"
  | "faulted";

export interface ConnectorOptions {
  id: number;
  type: string;
  format: ConnectorFormat;
  powerType: ConnectorPowerType;
  maxVoltage?: number;
  maxCurrent?: number;
  maxPower?: number;
  plugState?: ConnectorPlugState;
  vehiclePresence?: ConnectorVehiclePresence;
  lockState?: ConnectorLockState;
  availability?: Availability;
  requestedAvailability?: Availability | null;
  faultCode?: string | null;
  activeFaultIds?: Iterable<string>;
  lastStatusAt?: Date | null;
}

export class Connector {
  readonly id: number;
  readonly type: string;
  readonly format: ConnectorFormat;
  readonly powerType: ConnectorPowerType;
  readonly maxVoltage?: number;
  readonly maxCurrent?: number;
  readonly maxPower?: number;
  private _plugState: ConnectorPlugState;
  private _vehiclePresence: ConnectorVehiclePresence;
  private _lockState: ConnectorLockState;
  private _availability: Availability;
  private _requestedAvailability: Availability | null;
  private _faultCode: string | null;
  private readonly _activeFaultIds: Set<string>;
  private _lastStatusAt: Date | null;

  constructor(options: ConnectorOptions) {
    assertPositiveInteger(options.id, "connector.id");
    if (options.maxVoltage !== undefined) {
      assertNonNegativeFiniteNumber(options.maxVoltage, "maxVoltage");
    }
    if (options.maxCurrent !== undefined) {
      assertNonNegativeFiniteNumber(options.maxCurrent, "maxCurrent");
    }
    if (options.maxPower !== undefined) {
      assertNonNegativeFiniteNumber(options.maxPower, "maxPower");
    }

    this.id = options.id;
    this.type = options.type;
    this.format = options.format;
    this.powerType = options.powerType;
    this.maxVoltage = options.maxVoltage;
    this.maxCurrent = options.maxCurrent;
    this.maxPower = options.maxPower;
    this._plugState = options.plugState ?? "unknown";
    this._vehiclePresence = options.vehiclePresence ?? "unknown";
    this._lockState = options.lockState ?? "unknown";
    this._availability = options.availability ?? "operative";
    this._requestedAvailability = options.requestedAvailability ?? null;
    this._faultCode = options.faultCode ?? null;
    this._activeFaultIds = cloneSet(options.activeFaultIds);
    this._lastStatusAt = cloneOptionalDate(options.lastStatusAt ?? null, "lastStatusAt") ?? null;
  }

  get plugState(): ConnectorPlugState {
    return this._plugState;
  }

  get vehiclePresence(): ConnectorVehiclePresence {
    return this._vehiclePresence;
  }

  get lockState(): ConnectorLockState {
    return this._lockState;
  }

  get status(): ConnectorStatus {
    if (this._activeFaultIds.size > 0) {
      return "faulted";
    }

    if (this._availability === "inoperative") {
      return "unavailable";
    }

    if (this._plugState === "plugged" || this._vehiclePresence === "detected") {
      return "occupied";
    }

    return "available";
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

  requestAvailability(nextAvailability: Availability): Connector {
    return this.clone({
      requestedAvailability: nextAvailability,
    });
  }

  applyRequestedAvailability(at: Date): Connector {
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

  setOccupied(isOccupied: boolean, at: Date): Connector {
    return this.clone({
      plugState: isOccupied ? "plugged" : "unplugged",
      vehiclePresence: isOccupied ? "detected" : "absent",
      lastStatusAt: at,
    });
  }

  setPlugState(nextState: ConnectorPlugState, at: Date): Connector {
    return this.clone({
      plugState: nextState,
      lastStatusAt: at,
    });
  }

  setVehiclePresence(
    nextPresence: ConnectorVehiclePresence,
    at: Date,
  ): Connector {
    return this.clone({
      vehiclePresence: nextPresence,
      lastStatusAt: at,
    });
  }

  setLockState(nextLockState: ConnectorLockState, at: Date): Connector {
    return this.clone({
      lockState: nextLockState,
      lastStatusAt: at,
    });
  }

  activateFault(faultId: string, faultCode: string, at: Date): Connector {
    return this.clone({
      activeFaultIds: new Set([...this._activeFaultIds, faultId]),
      faultCode,
      lastStatusAt: at,
    });
  }

  clearFault(faultId: string, at: Date): Connector {
    const nextActiveFaultIds = cloneSet(this._activeFaultIds);
    nextActiveFaultIds.delete(faultId);

    return this.clone({
      activeFaultIds: nextActiveFaultIds,
      faultCode: nextActiveFaultIds.size === 0 ? null : this._faultCode,
      lastStatusAt: at,
    });
  }

  private clone(overrides: Partial<ConnectorOptions>): Connector {
    return new Connector({
      id: this.id,
      type: this.type,
      format: this.format,
      powerType: this.powerType,
      maxVoltage: this.maxVoltage,
      maxCurrent: this.maxCurrent,
      maxPower: this.maxPower,
      plugState: this._plugState,
      vehiclePresence: this._vehiclePresence,
      lockState: this._lockState,
      availability: this._availability,
      requestedAvailability: this._requestedAvailability,
      faultCode: this._faultCode,
      activeFaultIds: this.listActiveFaultIds(),
      lastStatusAt: this.lastStatusAt,
      ...overrides,
    });
  }

}
