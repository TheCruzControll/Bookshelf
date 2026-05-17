/**
 * Tiny debouncer used by the search input to avoid one tRPC call per
 * keystroke. Pulled out as a plain function so it can be unit-tested
 * deterministically with `vi.useFakeTimers()` — the React hook layer in
 * `SearchInput` just feeds the current input into this debouncer.
 */
export interface Debouncer<T> {
  /** Schedule (or reschedule) a call with the given value. */
  schedule(value: T): void;
  /** Cancel any pending call. */
  cancel(): void;
}

export function createDebouncer<T>(
  fn: (value: T) => void,
  delayMs: number,
): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(value: T) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        fn(value);
      }, delayMs);
    },
    cancel() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
