export type Clock = {
  nowIso(): string;
};

export const SystemClock: Clock = {
  nowIso(): string {
    return new Date().toISOString();
  },
};

export function createFixedClock(iso: string): Clock {
  return {
    nowIso(): string {
      return iso;
    },
  };
}
