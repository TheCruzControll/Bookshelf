"use client";

import { useState, useCallback } from "react";
import type { FeedGroupInput, FeedItemInput, ActivityVerbInput } from "@hone/domain";

export interface FeedGroupedViewProps {
  /** Pre-grouped feed groups (newest first), typically from `feed.list` tRPC query. */
  groups: FeedGroupInput[];
  /** Optional empty-state message override. */
  emptyMessage?: string;
}

export interface FeedGroupCardProps {
  group: FeedGroupInput;
}

/**
 * Human-readable verb form used inside a grouped summary like
 * "Maya finished 3 books".  The verb is matched to the activity event verb.
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

/** Render a single feed item row inside an expanded group or as a stand-alone card. */
function FeedItemRow({ item }: { item: FeedItemInput }) {
  const actor = item.actor.displayName;
  const verb = verbToSummaryText(item.event.verb);
  const title = item.book?.canonicalTitle ?? item.shelf?.name ?? "";
  const score =
    typeof item.event.scoreAtPublish === "number"
      ? item.event.scoreAtPublish.toFixed(2)
      : null;
  return (
    <article className="feedItem" data-testid="feed-item">
      <div>
        <p>{actor}</p>
        <strong>{verb}</strong>
        <span>{title}</span>
      </div>
      {score ? <small>{score}</small> : null}
    </article>
  );
}

export interface FeedGroupCardViewProps {
  group: FeedGroupInput;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Controlled presentation of a feed group card.  The `expanded` state
 * is owned by the caller, which makes this layer trivial to render in
 * tests without React hooks.
 */
export function FeedGroupCardView({
  group,
  expanded,
  onToggle,
}: FeedGroupCardViewProps) {
  if (group.items.length === 0) {
    return null;
  }

  if (group.items.length === 1) {
    const item = group.items[0];
    if (!item) return null;
    return <FeedItemRow item={item} />;
  }

  // Top three covers form the visible stack; remaining items are still
  // accessible once the group is expanded.
  const covers = group.items
    .slice(0, 3)
    .map((it) => it.book?.coverUrl ?? null);
  const headline = summarizeGroup(group);

  return (
    <article
      className="feedGroupCard"
      data-testid="feed-group-card"
      data-group-key={group.groupKey}
    >
      <button
        type="button"
        className="feedGroupSummary"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`group-${group.groupKey}`}
      >
        <span
          className="feedGroupCovers"
          aria-hidden="true"
          data-testid="feed-group-covers"
        >
          {covers.map((url, idx) => (
            <span
              key={`${group.groupKey}-cover-${idx}`}
              className={`feedGroupCover feedGroupCover${idx}`}
              style={url ? { backgroundImage: `url(${url})` } : undefined}
              data-testid="feed-group-cover"
            />
          ))}
        </span>
        <span className="feedGroupHeadline">{headline}</span>
        <span className="feedGroupChevron" aria-hidden="true">
          {expanded ? "v" : ">"}
        </span>
      </button>
      {expanded ? (
        <div
          id={`group-${group.groupKey}`}
          className="feedGroupItems"
          data-testid="feed-group-items"
        >
          {group.items.map((item) => (
            <FeedItemRow key={item.event.id} item={item} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Stateful wrapper around `FeedGroupCardView` that owns the
 * expand/collapse state.  When the group contains a single item we
 * render the existing single-event card layout.  When it contains
 * multiple items we render a stacked-covers summary card that expands
 * on click to reveal the underlying events.
 */
export function FeedGroupCard({ group }: FeedGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  return (
    <FeedGroupCardView group={group} expanded={expanded} onToggle={toggle} />
  );
}

/**
 * Render a chronological list of feed groups.  The server-side
 * `feed.list` procedure already groups consecutive events by
 * `(actorId, verb)` over a sliding 24h window, so this view only has
 * to lay them out and handle expand-on-tap behaviour.
 */
export function FeedGroupedView({ groups, emptyMessage }: FeedGroupedViewProps) {
  if (groups.length === 0) {
    return (
      <p className="feedEmpty" data-testid="feed-empty">
        {emptyMessage ?? "No activity yet."}
      </p>
    );
  }

  return (
    <div className="feed" data-testid="feed-grouped-view">
      {groups.map((group) => (
        <FeedGroupCard key={group.groupKey} group={group} />
      ))}
    </div>
  );
}
