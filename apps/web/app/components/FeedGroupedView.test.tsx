import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FeedGroupCard,
  FeedGroupCardView,
  FeedGroupedView,
  groupNoun,
  summarizeGroup,
  verbToSummaryText,
} from "./FeedGroupedView";
import type {
  EntityId,
  FeedGroupInput,
  FeedItemInput,
  ActivityVerbInput,
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

function makeActor(name: string, id = "00000000-0000-0000-0000-000000000a01"): FeedItemInput["actor"] {
  return {
    id: id as EntityId,
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
  id = "00000000-0000-0000-0000-0000000000b1",
  coverUrl?: string,
): FeedItemInput["book"] {
  return {
    id: id as EntityId,
    canonicalTitle: title,
    coverUrl,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeItem(
  overrides: {
    eventId: string;
    actor: FeedItemInput["actor"];
    verb: ActivityVerbInput;
    book?: FeedItemInput["book"];
    occurredAt?: Date;
  },
): FeedItemInput {
  return {
    event: {
      id: overrides.eventId as EntityId,
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
  it("translates known activity verbs to display verbs", () => {
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
        makeItem({ eventId: "00000000-0000-0000-0000-000000000e01", actor: maya, verb: "book_finished", book: makeBook("Tomorrow", "00000000-0000-0000-0000-0000000000b1") }),
        makeItem({ eventId: "00000000-0000-0000-0000-000000000e02", actor: maya, verb: "book_finished", book: makeBook("Fifth Season", "00000000-0000-0000-0000-0000000000b2") }),
        makeItem({ eventId: "00000000-0000-0000-0000-000000000e03", actor: maya, verb: "book_finished", book: makeBook("A Memory", "00000000-0000-0000-0000-0000000000b3") }),
      ],
    };
    expect(summarizeGroup(group)).toBe("Maya finished 3 books");
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

describe("FeedGroupCard rendering", () => {
  const sam = makeActor("Sam", "00000000-0000-0000-0000-000000000a02");
  const maya = makeActor("Maya", "00000000-0000-0000-0000-000000000a03");

  it("renders a single-event group as a single feed item card (no group summary)", () => {
    const group: FeedGroupInput = {
      groupKey: `${sam.id}:book_finished:b1`,
      occurredAt: NOW,
      items: [
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e10",
          actor: sam,
          verb: "book_finished",
          book: makeBook("Project Hail Mary", "00000000-0000-0000-0000-0000000000c1"),
        }),
      ],
    };
    const html = renderToStaticMarkup(<FeedGroupCard group={group} />);
    expect(html).toContain("feedItem");
    expect(html).toContain("Project Hail Mary");
    expect(html).toContain("Sam");
    // Single-event groups do not show the summary card scaffolding.
    expect(html).not.toContain("feedGroupCard");
    expect(html).not.toContain("feedGroupCovers");
  });

  it("renders a 3-event group as a 'Maya finished 3 books' card with three covers, collapsed by default", () => {
    const group: FeedGroupInput = {
      groupKey: `${maya.id}:book_finished:b1`,
      occurredAt: NOW,
      items: [
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e20",
          actor: maya,
          verb: "book_finished",
          book: makeBook("Tomorrow", "00000000-0000-0000-0000-0000000000d1", "https://covers.example/1.jpg"),
        }),
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e21",
          actor: maya,
          verb: "book_finished",
          book: makeBook("Fifth Season", "00000000-0000-0000-0000-0000000000d2", "https://covers.example/2.jpg"),
        }),
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e22",
          actor: maya,
          verb: "book_finished",
          book: makeBook("A Memory", "00000000-0000-0000-0000-0000000000d3", "https://covers.example/3.jpg"),
        }),
      ],
    };
    const html = renderToStaticMarkup(<FeedGroupCard group={group} />);
    expect(html).toContain("feedGroupCard");
    expect(html).toContain("Maya finished 3 books");
    // Three cover slots.
    const coverMatches = html.match(/data-testid="feed-group-cover"/g) ?? [];
    expect(coverMatches).toHaveLength(3);
    // Each book cover URL appears in inline background-image style.
    expect(html).toContain("covers.example/1.jpg");
    expect(html).toContain("covers.example/2.jpg");
    expect(html).toContain("covers.example/3.jpg");
    // Default state is collapsed: aria-expanded is false and the
    // expanded item list is not rendered.
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="feed-group-items"');
  });

  it("renders the individual events when the controlled view is expanded", () => {
    const group: FeedGroupInput = {
      groupKey: `${maya.id}:book_finished:b1`,
      occurredAt: NOW,
      items: [
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e30",
          actor: maya,
          verb: "book_finished",
          book: makeBook("Tomorrow", "00000000-0000-0000-0000-0000000000d1"),
        }),
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e31",
          actor: maya,
          verb: "book_finished",
          book: makeBook("Fifth Season", "00000000-0000-0000-0000-0000000000d2"),
        }),
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e32",
          actor: maya,
          verb: "book_finished",
          book: makeBook("A Memory", "00000000-0000-0000-0000-0000000000d3"),
        }),
      ],
    };
    const html = renderToStaticMarkup(
      <FeedGroupCardView group={group} expanded={true} onToggle={() => {}} />,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-testid="feed-group-items"');
    // All three individual book titles are present in the expanded list.
    expect(html).toContain("Tomorrow");
    expect(html).toContain("Fifth Season");
    expect(html).toContain("A Memory");
    const itemMatches = html.match(/data-testid="feed-item"/g) ?? [];
    expect(itemMatches).toHaveLength(3);
  });

  it("toggling the FeedGroupCard via onToggle flips aria-expanded (controlled state)", () => {
    const group: FeedGroupInput = {
      groupKey: `${maya.id}:book_finished:b1`,
      occurredAt: NOW,
      items: [
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e40",
          actor: maya,
          verb: "book_finished",
          book: makeBook("A", "00000000-0000-0000-0000-0000000000e1"),
        }),
        makeItem({
          eventId: "00000000-0000-0000-0000-000000000e41",
          actor: maya,
          verb: "book_finished",
          book: makeBook("B", "00000000-0000-0000-0000-0000000000e2"),
        }),
      ],
    };
    const collapsed = renderToStaticMarkup(
      <FeedGroupCardView group={group} expanded={false} onToggle={() => {}} />,
    );
    const expanded = renderToStaticMarkup(
      <FeedGroupCardView group={group} expanded={true} onToggle={() => {}} />,
    );
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).not.toContain('data-testid="feed-group-items"');
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).toContain('data-testid="feed-group-items"');
  });
});

describe("FeedGroupedView", () => {
  it("renders an empty-state message when no groups are present", () => {
    const html = renderToStaticMarkup(<FeedGroupedView groups={[]} />);
    expect(html).toContain('data-testid="feed-empty"');
    expect(html).toContain("No activity yet.");
  });

  it("renders each group as a card", () => {
    const sam = makeActor("Sam", "00000000-0000-0000-0000-000000000a04");
    const maya = makeActor("Maya", "00000000-0000-0000-0000-000000000a05");
    const groups: FeedGroupInput[] = [
      {
        groupKey: `${maya.id}:book_finished:1`,
        occurredAt: NOW,
        items: [
          makeItem({
            eventId: "00000000-0000-0000-0000-000000000f01",
            actor: maya,
            verb: "book_finished",
            book: makeBook("Book A", "00000000-0000-0000-0000-0000000000f1"),
          }),
          makeItem({
            eventId: "00000000-0000-0000-0000-000000000f02",
            actor: maya,
            verb: "book_finished",
            book: makeBook("Book B", "00000000-0000-0000-0000-0000000000f2"),
          }),
        ],
      },
      {
        groupKey: `${sam.id}:book_dropped:1`,
        occurredAt: NOW,
        items: [
          makeItem({
            eventId: "00000000-0000-0000-0000-000000000f10",
            actor: sam,
            verb: "book_dropped",
            book: makeBook("A Dense Biography", "00000000-0000-0000-0000-0000000000f3"),
          }),
        ],
      },
    ];
    const html = renderToStaticMarkup(<FeedGroupedView groups={groups} />);
    expect(html).toContain("Maya finished 2 books");
    expect(html).toContain("A Dense Biography");
    expect(html).toContain('data-testid="feed-grouped-view"');
  });
});
