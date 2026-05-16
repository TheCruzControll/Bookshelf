import { describe, it, expect } from "vitest";
import {
  groupNoun,
  summarizeGroup,
  verbToSummaryText,
} from "./feedGrouping";
import type {
  FeedGroupedViewProps,
  FeedGroupCardViewProps,
} from "./FeedGroupedView";
import type {
  ActivityVerbInput,
  EntityId,
  FeedGroupInput,
  FeedItemInput,
} from "@hone/domain";

const NOW = new Date("2026-05-15T12:00:00Z");

const DEFAULT_VIS: FeedItemInput["actor"]["defaultVisibility"] = {
  identity: "followers",
  follower_list: "followers",
  review: "followers",
  score: "followers",
  finished_shelf: "followers",
  custom_shelf: "followers",
  want_to_read_shelf: "followers",
  reading_shelf: "followers",
  dropped_shelf: "followers",
  reading_status: "followers",
  activity_stream: "followers",
};

function makeActor(
  name: string,
  id: EntityId = "00000000-0000-0000-0000-000000000a01" as EntityId,
): FeedItemInput["actor"] {
  return {
    id,
    handle: name.toLowerCase(),
    displayName: name,
    verified: false,
    defaultVisibility: DEFAULT_VIS,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeBook(
  title: string,
  id: EntityId = "00000000-0000-0000-0000-0000000000b1" as EntityId,
  coverUrl?: string,
): FeedItemInput["book"] {
  return {
    id,
    canonicalTitle: title,
    coverUrl,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeItem(overrides: {
  eventId: EntityId;
  actor: FeedItemInput["actor"];
  verb: ActivityVerbInput;
  book?: FeedItemInput["book"];
  occurredAt?: Date;
}): FeedItemInput {
  return {
    event: {
      id: overrides.eventId,
      actorId: overrides.actor.id,
      verb: overrides.verb,
      bookId: overrides.book?.id,
      visibility: "followers",
      occurredAt: overrides.occurredAt ?? NOW,
    },
    actor: overrides.actor,
    book: overrides.book,
  };
}

describe("verbToSummaryText", () => {
  it("translates known activity verbs to display verbs (native parity with web)", () => {
    expect(verbToSummaryText("book_finished")).toBe("finished");
    expect(verbToSummaryText("book_started")).toBe("started");
    expect(verbToSummaryText("book_dropped")).toBe("dropped");
    expect(verbToSummaryText("book_added")).toBe("added");
    expect(verbToSummaryText("book_ranked")).toBe("ranked");
    expect(verbToSummaryText("book_reviewed")).toBe("reviewed");
    expect(verbToSummaryText("shelf_updated")).toBe("updated");
  });
});

describe("groupNoun", () => {
  it("uses singular vs plural based on count", () => {
    expect(groupNoun("book_finished", 1)).toBe("book");
    expect(groupNoun("book_finished", 3)).toBe("books");
  });

  it("uses shelf/shelves for shelf_updated", () => {
    expect(groupNoun("shelf_updated", 1)).toBe("shelf");
    expect(groupNoun("shelf_updated", 4)).toBe("shelves");
  });
});

describe("summarizeGroup", () => {
  it("produces \"Maya finished 3 books\" for a 3-book finished group", () => {
    const maya = makeActor("Maya");
    const group: FeedGroupInput = {
      groupKey: `${maya.id}:book_finished:b1`,
      occurredAt: NOW,
      items: [
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e01" as EntityId,
          actor: maya,
          verb: "book_finished",
          book: makeBook("Tomorrow", "00000000-0000-0000-0000-0000000000b1" as EntityId),
        }),
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e02" as EntityId,
          actor: maya,
          verb: "book_finished",
          book: makeBook("Fifth Season", "00000000-0000-0000-0000-0000000000b2" as EntityId),
        }),
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e03" as EntityId,
          actor: maya,
          verb: "book_finished",
          book: makeBook("A Memory", "00000000-0000-0000-0000-0000000000b3" as EntityId),
        }),
      ],
    };
    expect(summarizeGroup(group)).toBe("Maya finished 3 books");
  });

  it("uses 'shelf'/'shelves' phrasing for shelf_updated groups", () => {
    const sam = makeActor("Sam", "00000000-0000-0000-0000-000000000a02" as EntityId);
    const group: FeedGroupInput = {
      groupKey: `${sam.id}:shelf_updated:s1`,
      occurredAt: NOW,
      items: [
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e10" as EntityId,
          actor: sam,
          verb: "shelf_updated",
        }),
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e11" as EntityId,
          actor: sam,
          verb: "shelf_updated",
        }),
      ],
    };
    expect(summarizeGroup(group)).toBe("Sam updated 2 shelves");
  });

  it("returns empty string for an empty group", () => {
    const group: FeedGroupInput = {
      groupKey: "empty",
      occurredAt: NOW,
      items: [],
    };
    expect(summarizeGroup(group)).toBe("");
  });
});

describe("FeedGroupedView component contract", () => {
  it("requires groups; refreshing + onRefresh are optional", () => {
    const props: FeedGroupedViewProps = { groups: [] };
    expect(props.groups).toEqual([]);
    expect(props.refreshing).toBeUndefined();
    expect(props.onRefresh).toBeUndefined();
  });

  it("accepts a refreshing flag and onRefresh callback for pull-to-refresh", () => {
    const calls: number[] = [];
    const props: FeedGroupedViewProps = {
      groups: [],
      refreshing: true,
      onRefresh: () => {
        calls.push(1);
      },
    };
    expect(props.refreshing).toBe(true);
    props.onRefresh?.();
    expect(calls).toEqual([1]);
  });

  it("accepts an optional emptyMessage override", () => {
    const props: FeedGroupedViewProps = {
      groups: [],
      emptyMessage: "Follow people to fill this feed.",
    };
    expect(props.emptyMessage).toBe("Follow people to fill this feed.");
  });
});

describe("FeedGroupCardView contract", () => {
  it("is controlled by `expanded` and reports toggles via `onToggle`", () => {
    const maya = makeActor("Maya", "00000000-0000-0000-0000-000000000a03" as EntityId);
    let toggleCount = 0;
    const group: FeedGroupInput = {
      groupKey: `${maya.id}:book_finished:b1`,
      occurredAt: NOW,
      items: [
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e20" as EntityId,
          actor: maya,
          verb: "book_finished",
          book: makeBook(
            "Tomorrow",
            "00000000-0000-0000-0000-0000000000d1" as EntityId,
            "https://covers.example/1.jpg",
          ),
        }),
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e21" as EntityId,
          actor: maya,
          verb: "book_finished",
          book: makeBook(
            "Fifth Season",
            "00000000-0000-0000-0000-0000000000d2" as EntityId,
          ),
        }),
      ],
    };
    const props: FeedGroupCardViewProps = {
      group,
      expanded: false,
      onToggle: () => {
        toggleCount += 1;
      },
    };
    expect(props.expanded).toBe(false);
    props.onToggle();
    props.onToggle();
    expect(toggleCount).toBe(2);
  });
});
