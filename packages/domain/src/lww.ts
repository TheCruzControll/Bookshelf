import type { ReadingStatus, Visibility } from "./types";

export interface LwwWrite<T> {
  value: T;
  updatedAt: Date;
}

export function resolveLww<T>(a: LwwWrite<T>, b: LwwWrite<T>): LwwWrite<T> {
  return b.updatedAt >= a.updatedAt ? b : a;
}

export function resolveStatusLww(
  a: LwwWrite<ReadingStatus>,
  b: LwwWrite<ReadingStatus>
): LwwWrite<ReadingStatus> {
  return resolveLww(a, b);
}

export function resolvePositionLww(
  a: LwwWrite<number>,
  b: LwwWrite<number>
): LwwWrite<number> {
  return resolveLww(a, b);
}

export function resolveFollowLww(
  a: LwwWrite<boolean>,
  b: LwwWrite<boolean>
): LwwWrite<boolean> {
  return resolveLww(a, b);
}

export function resolveBlockLww(
  a: LwwWrite<boolean>,
  b: LwwWrite<boolean>
): LwwWrite<boolean> {
  return resolveLww(a, b);
}

export function resolveVisibilityLww(
  a: LwwWrite<Visibility>,
  b: LwwWrite<Visibility>
): LwwWrite<Visibility> {
  return resolveLww(a, b);
}
