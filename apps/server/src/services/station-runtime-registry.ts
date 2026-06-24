import type { StationRecord } from "../repositories/station.repository";
import type { ProtocolEventProjection } from "./protocol-event-projection";
import {
  createStationRuntime,
  type StationRuntime,
  type StationRuntimeFactory
} from "./station-runtime.adapter";

interface RuntimeEntry {
  runtime: StationRuntime;
  unsubscribe: Array<() => void>;
}

export class StationRuntimeRegistry {
  private readonly runtimes = new Map<string, RuntimeEntry>();

  constructor(
    private readonly eventProjection: ProtocolEventProjection,
    private readonly runtimeFactory: StationRuntimeFactory = createStationRuntime,
  ) {}

  has(stationId: string): boolean {
    return this.runtimes.has(stationId);
  }

  get(stationId: string): StationRuntime | undefined {
    return this.runtimes.get(stationId)?.runtime;
  }

  async start(station: StationRecord): Promise<StationRuntime> {
    const existing = this.get(station.id);
    if (existing !== undefined) {
      return existing;
    }

    const runtime = this.runtimeFactory(station);
    const unsubscribe = this.eventProjection.subscribeToRuntime(station.id, runtime.events);
    this.runtimes.set(station.id, { runtime, unsubscribe });

    try {
      await runtime.start();
      return runtime;
    } catch (cause) {
      await this.dispose(station.id);
      throw cause;
    }
  }

  async stop(stationId: string): Promise<void> {
    const runtime = this.get(stationId);
    if (runtime === undefined) {
      return;
    }

    await runtime.stop();
    await this.dispose(stationId);
  }

  async dispose(stationId: string): Promise<void> {
    const entry = this.runtimes.get(stationId);
    if (entry === undefined) {
      return;
    }

    this.runtimes.delete(stationId);
    for (const unsubscribe of entry.unsubscribe) {
      unsubscribe();
    }
    await entry.runtime.dispose();
  }
}
