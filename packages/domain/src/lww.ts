import type { ReadingStatus, Visibility } from "./types";

// ---------------------------------------------------------------------------
// Optimistic-locking conflict (T-02, #163)
// ---------------------------------------------------------------------------

export type VersionedResource =
  | "review"
  | "shelf"
  | "list"
  | "ranking"
  | "profile";

/**
 * Typed payload surfaced by the server on a 409 CONFLICT response so the
 * client can offer the user a manual-merge prompt with the current value
 * already in hand (no extra round-trip).
 */
export interface VersionConflictPayload<T = unknown> {
  /** Sentinel discriminator so client code can narrow on `data.code`. */
  code: "VERSION_CONFLICT";
  resource: VersionedResource;
  currentVersion: number;
  currentValue: T;
}

/**
 * Server-side error class. Services throw this when they detect a stale
 * version; the tRPC error formatter maps it to TRPCError("CONFLICT") and
 * embeds the typed payload under `data.conflict`.
 */
export class VersionConflictError<T = unknown> extends Error {
  readonly code: "VERSION_CONFLICT" = "VERSION_CONFLICT";
  readonly resource: VersionedResource;
  readonly currentVersion: number;
  readonly currentValue: T;
  constructor(input: {
    resource: VersionedResource;
    currentVersion: number;
    currentValue: T;
    message?: string;
  }) {
    super(input.message ?? `Version conflict on ${input.resource}`);
    this.name = "VersionConflictError";
    this.resource = input.resource;
    this.currentVersion = input.currentVersion;
    this.currentValue = input.currentValue;
  }

  toPayload(): VersionConflictPayload<T> {
    return {
      code: this.code,
      resource: this.resource,
      currentVersion: this.currentVersion,
      currentValue: this.currentValue,
    };
  }
}

/**
 * Client-side helper that narrows a tRPC error to the typed conflict
 * payload, or returns null when it's a different error. The expected
 * shape is the wire shape produced by the error formatter:
 *
 *   {
 *     code: "CONFLICT",
 *     data: { conflict: { code: "VERSION_CONFLICT", ... } }
 *   }
 */
export function extractVersionConflict<T = unknown>(
  err: unknown,
): VersionConflictPayload<T> | null {
  if (!err || typeof err !== "object") return null;
  const e = err as {
    data?: { code?: string; conflict?: unknown };
    shape?: { data?: { code?: string; conflict?: unknown } };
  };
  const data = e.data ?? e.shape?.data;
  if (!data || data.code !== "CONFLICT") return null;
  const conflict = data.conflict;
  if (!conflict || typeof conflict !== "object") return null;
  const c = conflict as Partial<VersionConflictPayload<T>>;
  if (
    c.code !== "VERSION_CONFLICT" ||
    typeof c.currentVersion !== "number" ||
    typeof c.resource !== "string"
  ) {
    return null;
  }
  return c as VersionConflictPayload<T>;
}

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
  if (a.updatedAt.getTime() === b.updatedAt.getTime()) {
    // Tiebreaker: unfollow wins (false > true) for consistency
    return a.value <= b.value ? a : b;
  }
  return resolveLww(a, b);
}

export function resolveBlockLww(
  a: LwwWrite<boolean>,
  b: LwwWrite<boolean>
): LwwWrite<boolean> {
  if (a.updatedAt.getTime() === b.updatedAt.getTime()) {
    // Tiebreaker: block wins (true > false) for safety
    return a.value >= b.value ? a : b;
  }
  return resolveLww(a, b);
}

export function resolveVisibilityLww(
  a: LwwWrite<Visibility>,
  b: LwwWrite<Visibility>
): LwwWrite<Visibility> {
  return resolveLww(a, b);
}
