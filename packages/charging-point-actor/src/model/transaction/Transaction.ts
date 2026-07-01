import { ModelError } from "../errors";
import {
  cloneDate,
  cloneNullableDate,
  cloneOptionalDate,
} from "../shared/collections";
import { assertNonNegativeFiniteNumber } from "../shared/invariants";
import {
  cloneResourceRef,
  type ResourceRef,
} from "../shared/ResourceRef";

export type TransactionState =
  | "starting"
  | "active"
  | "suspended"
  | "ending"
  | "ended";

export type ChargingState =
  | "idle"
  | "charging"
  | "suspended-by-ev"
  | "suspended-by-station";

export type TransactionStopReason =
  | "local"
  | "remote"
  | "unlock-command"
  | "ev-disconnected"
  | "deauthorized"
  | "emergency-stop"
  | "other";

export interface TransactionOptions {
  id: string;
  target: ResourceRef;
  credentialId: string;
  startedAt: Date;
  startMeterWh: number;
  latestMeterWh?: number;
  endedAt?: Date | null;
  state?: TransactionState;
  chargingState?: ChargingState;
  endMeterWh?: number | null;
  consumedEnergyWh?: number;
  stopReason?: TransactionStopReason | null;
}

export class Transaction {
  readonly id: string;
  private readonly _target: ResourceRef;
  readonly credentialId: string;
  private readonly _startedAt: Date;
  private _endedAt: Date | null;
  private _state: TransactionState;
  private _chargingState: ChargingState;
  private readonly _startMeterWh: number;
  private _latestMeterWh: number;
  private _endMeterWh: number | null;
  private _consumedEnergyWh: number;
  private _stopReason: TransactionStopReason | null;

  constructor(options: TransactionOptions) {
    assertNonNegativeFiniteNumber(options.startMeterWh, "startMeterWh");

    const latestMeterWh = options.latestMeterWh ?? options.startMeterWh;
    assertNonNegativeFiniteNumber(latestMeterWh, "latestMeterWh");

    if (latestMeterWh < options.startMeterWh) {
      throw new ModelError("MODEL_INVALID_ARGUMENT", "latestMeterWh 不能小于 startMeterWh");
    }

    const endMeterWh = options.endMeterWh ?? null;
    if (endMeterWh !== null) {
      assertNonNegativeFiniteNumber(endMeterWh, "endMeterWh");

      if (endMeterWh < options.startMeterWh) {
        throw new ModelError("MODEL_INVALID_ARGUMENT", "endMeterWh 不能小于 startMeterWh");
      }

      if (endMeterWh < latestMeterWh) {
        throw new ModelError("MODEL_INVALID_ARGUMENT", "endMeterWh 不能小于 latestMeterWh");
      }
    }

    const expectedConsumedEnergyWh = latestMeterWh - options.startMeterWh;
    const consumedEnergyWh =
      options.consumedEnergyWh ?? expectedConsumedEnergyWh;
    assertNonNegativeFiniteNumber(consumedEnergyWh, "consumedEnergyWh");

    if (consumedEnergyWh !== expectedConsumedEnergyWh) {
      throw new ModelError(
        "MODEL_INVALID_ARGUMENT",
        "consumedEnergyWh 必须等于 latestMeterWh 与 startMeterWh 的差值",
      );
    }

    this.id = options.id;
    this._target = cloneResourceRef(options.target);
    this.credentialId = options.credentialId;
    this._startedAt = cloneDate(options.startedAt, "startedAt");
    this._endedAt = cloneOptionalDate(options.endedAt ?? null, "endedAt") ?? null;
    this._state = options.state ?? "starting";
    this._chargingState = options.chargingState ?? "idle";
    this._startMeterWh = options.startMeterWh;
    this._latestMeterWh = latestMeterWh;
    this._endMeterWh = endMeterWh;
    this._consumedEnergyWh = consumedEnergyWh;
    this._stopReason = options.stopReason ?? null;
  }

  get target(): ResourceRef {
    return cloneResourceRef(this._target);
  }

  get startedAt(): Date {
    return cloneDate(this._startedAt, "startedAt");
  }

  get endedAt(): Date | null {
    return cloneNullableDate(this._endedAt, "endedAt");
  }

  get state(): TransactionState {
    return this._state;
  }

  get chargingState(): ChargingState {
    return this._chargingState;
  }

  get startMeterWh(): number {
    return this._startMeterWh;
  }

  get latestMeterWh(): number {
    return this._latestMeterWh;
  }

  get endMeterWh(): number | null {
    return this._endMeterWh;
  }

  get consumedEnergyWh(): number {
    return this._consumedEnergyWh;
  }

  get stopReason(): TransactionStopReason | null {
    return this._stopReason;
  }

  activate(): Transaction {
    if (this._state === "ended" || this._state === "ending") {
      throw new ModelError("MODEL_STATE_CONFLICT", "已结束流程的交易不能重新激活");
    }

    return this.clone({
      state: "active",
    });
  }

  startCharging(): Transaction {
    if (this._state === "ended" || this._state === "ending") {
      throw new ModelError("MODEL_STATE_CONFLICT", "已结束流程的交易不能开始充电");
    }

    return this.clone({
      state: "active",
      chargingState: "charging",
    });
  }

  suspend(by: "ev" | "station"): Transaction {
    if (this._state === "ending" || this._state === "ended") {
      throw new ModelError("MODEL_STATE_CONFLICT", "结束态交易不能进入挂起");
    }

    return this.clone({
      state: "suspended",
      chargingState: by === "ev" ? "suspended-by-ev" : "suspended-by-station",
    });
  }

  resumeCharging(): Transaction {
    if (this._state !== "suspended") {
      throw new ModelError("MODEL_STATE_CONFLICT", "只有 suspended 态交易可以恢复");
    }

    return this.clone({
      state: "active",
      chargingState: "charging",
    });
  }

  recordMeterValue(meterWh: number): Transaction {
    assertNonNegativeFiniteNumber(meterWh, "meterWh");

    if (this._state === "ended") {
      throw new ModelError("MODEL_STATE_CONFLICT", "已结束交易不能继续记录电表值");
    }

    if (meterWh < this._latestMeterWh) {
      throw new ModelError("MODEL_STATE_CONFLICT", "meterWh 不能回退");
    }

    return this.clone({
      latestMeterWh: meterWh,
      consumedEnergyWh: meterWh - this._startMeterWh,
    });
  }

  startEnding(reason?: TransactionStopReason): Transaction {
    if (this._state === "ended") {
      throw new ModelError("MODEL_STATE_CONFLICT", "已结束交易不能重复结束");
    }

    return this.clone({
      state: "ending",
      chargingState: "idle",
      stopReason: reason,
    });
  }

  end(
    reason: TransactionStopReason | undefined,
    endedAt: Date,
    endMeterWh?: number,
  ): Transaction {
    if (this._state === "ended") {
      throw new ModelError("MODEL_STATE_CONFLICT", "已结束交易不能重复结束");
    }

    const transactionWithMeter = typeof endMeterWh === "number"
      ? this.recordMeterValue(endMeterWh)
      : this;

    return transactionWithMeter.clone({
      state: "ended",
      chargingState: "idle",
      endedAt,
      endMeterWh: transactionWithMeter.latestMeterWh,
      stopReason: reason,
    });
  }

  private clone(overrides: Partial<TransactionOptions>): Transaction {
    return new Transaction({
      id: this.id,
      target: this.target,
      credentialId: this.credentialId,
      startedAt: this.startedAt,
      startMeterWh: this._startMeterWh,
      latestMeterWh: this._latestMeterWh,
      endedAt: this.endedAt,
      state: this._state,
      chargingState: this._chargingState,
      endMeterWh: this._endMeterWh,
      consumedEnergyWh: this._consumedEnergyWh,
      stopReason: this._stopReason,
      ...overrides,
    });
  }
}
