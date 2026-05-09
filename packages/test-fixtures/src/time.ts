export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const THIRTY_MIN_MS = 30 * 60 * 1000;
export const ONE_MONTH_MS = 31 * 24 * 60 * 60 * 1000;
export const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function advanceByMs(base: Date, ms: number): Date {
  return new Date(base.getTime() + ms);
}

export function advanceByDays(base: Date, days: number): Date {
  return advanceByMs(base, days * 24 * 60 * 60 * 1000);
}

export function advanceByMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function subtractMs(base: Date, ms: number): Date {
  return new Date(base.getTime() - ms);
}

export interface FakeTimerHandle {
  now(): Date;
  advance(ms: number): void;
  advanceDays(days: number): void;
  reset(): void;
}

export function createFakeTimer(start?: Date): FakeTimerHandle {
  let current = start ? new Date(start) : new Date("2024-01-15T12:00:00.000Z");
  const initial = new Date(current);

  return {
    now(): Date {
      return new Date(current);
    },
    advance(ms: number): void {
      current = new Date(current.getTime() + ms);
    },
    advanceDays(days: number): void {
      current = advanceByDays(current, days);
    },
    reset(): void {
      current = new Date(initial);
    },
  };
}

export function afterDeletionGrace(base: Date): Date {
  return advanceByDays(base, 31);
}

export function withinDeletionGrace(base: Date): Date {
  return advanceByDays(base, 15);
}

export function afterSaltRotation(base: Date): Date {
  return advanceByMonths(base, 1);
}

export function withinGroupingWindow(base: Date, offsetMinutes: number): Date {
  return advanceByMs(base, offsetMinutes * 60 * 1000);
}

export function outsideGroupingWindow(base: Date): Date {
  return advanceByMs(base, 31 * 60 * 1000);
}

export function afterBlockRetention(base: Date): Date {
  return advanceByDays(base, 91);
}
