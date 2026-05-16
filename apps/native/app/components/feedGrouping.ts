import type { ActivityVerbInput, FeedGroupInput } from "@hone/domain";

/**
 * Pure grouping helpers shared between the native FeedGroupedView
 * component and its tests. Mirrors apps/web/app/components/FeedGroupedView.tsx
 * (#136) so native parity (#137) stays in lock-step with the web feed.
 *
 * Kept in a separate `.ts` file (no JSX, no React Native imports) so
 * vitest can exercise the logic without standing up a native renderer.
 */

/**
 * Human-readable verb form used inside a grouped summary like
 * "Maya finished 3 books". The verb is matched to the activity event verb.
 */
export function verbToSummaryText(verb: ActivityVerbInput): string {
  switch (verb) {
    case "book_added":
      return "added";
    case "book_started":
      return "started";
    case "book_finished":
      return "finished";
    case "book_dropped":
      return "dropped";
    case "book_ranked":
      return "ranked";
    case "book_reviewed":
      return "reviewed";
    case "shelf_updated":
      return "updated";
    default:
      return "shared";
  }
}

/**
 * Noun (singular/plural) describing the items in a group of a given verb.
 * For shelf-related verbs we say "shelves"; otherwise "books".
 */
export function groupNoun(verb: ActivityVerbInput, count: number): string {
  if (verb === "shelf_updated") {
    return count === 1 ? "shelf" : "shelves";
  }
  return count === 1 ? "book" : "books";
}

/** Build the summary headline for a group with multiple items. */
export function summarizeGroup(group: FeedGroupInput): string {
  const first = group.items[0];
  if (!first) return "";
  const actor = first.actor.displayName;
  const verb = verbToSummaryText(first.event.verb);
  const noun = groupNoun(first.event.verb, group.items.length);
  return `${actor} ${verb} ${group.items.length} ${noun}`;
}
