export interface ProtocolClock {
  now(): Date;
  isSynced(): boolean;
  sync(currentTime: Date): void;
}

export function createProtocolClock(
  baseClock: () => Date = () => new Date(),
): ProtocolClock {
  let clockOffsetMs = 0;
  let synced = false;

  return {
    now: () => new Date(baseClock().getTime() + clockOffsetMs),
    isSynced: () => synced,
    sync: (currentTime) => {
      clockOffsetMs = currentTime.getTime() - baseClock().getTime();
      synced = true;
    },
  };
}
