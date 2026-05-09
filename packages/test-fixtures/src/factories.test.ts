import { describe, it, expect, beforeEach } from "vitest";
import {
  makeProfile,
  makeAuthor,
  makeBook,
  makeEdition,
  makeShelf,
  makeShelfItem,
  makeReview,
  makeActivityEvent,
  makeFeedItem,
  makeRecommendation,
  makeRanking,
  resetCounter,
} from "./factories.js";
import { POSTURE_C_DEFAULTS } from "@hone/domain";
import {
  seedFollowGraph,
  seedCatalog,
  seedRankingState,
  seedReviews,
  seedFeedEvents,
} from "./scenes.js";
import {
  createFakeTimer,
  advanceByDays,
  advanceByMs,
  afterDeletionGrace,
  withinDeletionGrace,
  outsideGroupingWindow,
  withinGroupingWindow,
  THIRTY_DAYS_MS,
  THIRTY_MIN_MS,
} from "./time.js";

beforeEach(() => {
  resetCounter();
});

describe("makeProfile", () => {
  it("creates a valid profile with defaults", () => {
    const profile = makeProfile();
    expect(profile.id).toBeDefined();
    expect(profile.handle).toMatch(/^user_/);
    expect(profile.defaultVisibility).toEqual(POSTURE_C_DEFAULTS);
    expect(profile.defaultVisibility.review).toBe("public");
    expect(profile.defaultVisibility.reading_shelf).toBe("followers");
    expect(profile.createdAt).toBeInstanceOf(Date);
  });

  it("accepts overrides", () => {
    const profile = makeProfile({ handle: "maya", displayName: "Maya" });
    expect(profile.handle).toBe("maya");
    expect(profile.displayName).toBe("Maya");
  });

  it("generates unique ids for each call", () => {
    const a = makeProfile();
    const b = makeProfile();
    expect(a.id).not.toBe(b.id);
  });
});

describe("makeAuthor", () => {
  it("creates an author with a name", () => {
    const author = makeAuthor();
    expect(author.id).toBeDefined();
    expect(author.name).toMatch(/^Author /);
  });
});

describe("makeBook", () => {
  it("creates a valid book with defaults", () => {
    const book = makeBook();
    expect(book.id).toBeDefined();
    expect(book.canonicalTitle).toMatch(/^Test Book /);
    expect(book.coverUrl).toBeUndefined();
    expect(book.firstPublishedYear).toBe(2020);
  });

  it("accepts coverUrl override", () => {
    const book = makeBook({ coverUrl: "https://example.com/cover.jpg" });
    expect(book.coverUrl).toBe("https://example.com/cover.jpg");
  });
});

describe("makeEdition", () => {
  it("creates an edition linked to a book", () => {
    const book = makeBook();
    const edition = makeEdition({ bookId: book.id });
    expect(edition.bookId).toBe(book.id);
    expect(edition.source).toBe("open_library");
    expect(edition.isbn13).toBeDefined();
  });
});

describe("makeShelf", () => {
  it("creates a non-system shelf by default", () => {
    const shelf = makeShelf();
    expect(shelf.isSystem).toBe(false);
    expect(shelf.visibility).toBe("public");
  });
});

describe("makeShelfItem", () => {
  it("creates a finished shelf item by default", () => {
    const item = makeShelfItem();
    expect(item.status).toBe("finished");
  });

  it("accepts status override", () => {
    const item = makeShelfItem({ status: "reading" });
    expect(item.status).toBe("reading");
  });
});

describe("makeReview", () => {
  it("creates a public review by default", () => {
    const review = makeReview();
    expect(review.visibility).toBe("public");
    expect(review.body).toBeTruthy();
  });
});

describe("makeActivityEvent", () => {
  it("creates a book_finished event by default", () => {
    const event = makeActivityEvent();
    expect(event.verb).toBe("book_finished");
    expect(event.occurredAt).toBeInstanceOf(Date);
  });
});

describe("makeFeedItem", () => {
  it("links event actor to provided actor", () => {
    const actor = makeProfile();
    const item = makeFeedItem({ actor });
    expect(item.actor.id).toBe(actor.id);
  });
});

describe("makeRecommendation", () => {
  it("creates a recommendation with score and reason", () => {
    const rec = makeRecommendation();
    expect(rec.score).toBeGreaterThan(0);
    expect(rec.score).toBeLessThanOrEqual(10);
    expect(rec.reason).toBeTruthy();
  });
});

describe("makeRanking", () => {
  it("creates a ranked entry with book and shelf item linked", () => {
    const entry = makeRanking();
    expect(entry.book.id).toBe(entry.shelfItem.bookId);
    expect(entry.shelfItem.rank).toBe(1);
    expect(entry.shelfItem.status).toBe("finished");
  });
});

describe("seedFollowGraph", () => {
  it("creates the requested number of users", () => {
    const { users } = seedFollowGraph({ users: 6, mutualPairs: 2 });
    expect(users).toHaveLength(6);
  });

  it("creates mutual follow pairs", () => {
    const { follows, mutualPairs } = seedFollowGraph({ users: 4, mutualPairs: 2 });
    expect(mutualPairs).toHaveLength(2);
    const mutualFollows = follows.filter((f) => f.mutual);
    expect(mutualFollows).toHaveLength(4);
  });

  it("defaults to creating users and follows", () => {
    const { users, follows } = seedFollowGraph();
    expect(users.length).toBeGreaterThan(0);
    expect(follows.length).toBeGreaterThan(0);
  });
});

describe("seedCatalog", () => {
  it("creates the requested number of books and editions", () => {
    const { books, editions } = seedCatalog({ books: 5 });
    expect(books).toHaveLength(5);
    expect(editions).toHaveLength(5);
  });

  it("sets cover urls when withCovers is true", () => {
    const { books } = seedCatalog({ books: 3, withCovers: true });
    for (const book of books) {
      expect(book.coverUrl).toBeDefined();
    }
  });

  it("links editions to their books", () => {
    const { books, editions } = seedCatalog({ books: 3 });
    for (let i = 0; i < books.length; i++) {
      expect(editions[i]?.bookId).toBe(books[i]?.id);
    }
  });
});

describe("seedRankingState", () => {
  it("creates ranked items for the given user", () => {
    const user = makeProfile();
    const { owner, rankedItems, shelf } = seedRankingState({ user, ranks: 10 });
    expect(owner.id).toBe(user.id);
    expect(rankedItems).toHaveLength(10);
    expect(shelf.ownerId).toBe(user.id);
  });

  it("assigns monotonically increasing rank positions", () => {
    const { rankedItems } = seedRankingState({ ranks: 5 });
    for (let i = 0; i < rankedItems.length; i++) {
      expect(rankedItems[i]?.shelfItem.rank).toBe(i + 1);
    }
  });
});

describe("seedReviews", () => {
  it("creates reviews tied to one author", () => {
    const author = makeProfile();
    const { reviews } = seedReviews({ author, count: 3 });
    expect(reviews).toHaveLength(3);
    for (const review of reviews) {
      expect(review.authorId).toBe(author.id);
    }
  });
});

describe("seedFeedEvents", () => {
  it("creates events within 30 min window when requested", () => {
    const { events } = seedFeedEvents({ count: 3, withinGroupingWindow: true });
    const first = events[0]!.occurredAt.getTime();
    const last = events[events.length - 1]!.occurredAt.getTime();
    expect(Math.abs(first - last)).toBeLessThan(THIRTY_MIN_MS);
  });

  it("creates events outside 30 min window when not grouping", () => {
    const { events } = seedFeedEvents({ count: 2, withinGroupingWindow: false });
    const first = events[0]!.occurredAt.getTime();
    const last = events[events.length - 1]!.occurredAt.getTime();
    expect(Math.abs(first - last)).toBeGreaterThan(THIRTY_MIN_MS);
  });
});

describe("time helpers", () => {
  it("createFakeTimer advances time correctly", () => {
    const timer = createFakeTimer();
    const t0 = timer.now();
    timer.advance(5000);
    const t1 = timer.now();
    expect(t1.getTime() - t0.getTime()).toBe(5000);
  });

  it("createFakeTimer resets to initial time", () => {
    const timer = createFakeTimer();
    const t0 = timer.now();
    timer.advance(THIRTY_DAYS_MS);
    timer.reset();
    expect(timer.now().getTime()).toBe(t0.getTime());
  });

  it("advanceDays moves clock by N days", () => {
    const timer = createFakeTimer();
    const t0 = timer.now();
    timer.advanceDays(30);
    const elapsed = timer.now().getTime() - t0.getTime();
    expect(elapsed).toBe(THIRTY_DAYS_MS);
  });

  it("afterDeletionGrace returns a date past 30 days", () => {
    const base = new Date("2024-01-15T00:00:00.000Z");
    const after = afterDeletionGrace(base);
    expect(after.getTime() - base.getTime()).toBeGreaterThan(THIRTY_DAYS_MS);
  });

  it("withinDeletionGrace returns a date before 30 days", () => {
    const base = new Date("2024-01-15T00:00:00.000Z");
    const within = withinDeletionGrace(base);
    expect(within.getTime() - base.getTime()).toBeLessThan(THIRTY_DAYS_MS);
  });

  it("outsideGroupingWindow returns offset > 30 min", () => {
    const base = new Date("2024-01-15T12:00:00.000Z");
    const outside = outsideGroupingWindow(base);
    expect(outside.getTime() - base.getTime()).toBeGreaterThan(THIRTY_MIN_MS);
  });

  it("withinGroupingWindow with <30 min offset stays in window", () => {
    const base = new Date("2024-01-15T12:00:00.000Z");
    const within = withinGroupingWindow(base, 29);
    expect(within.getTime() - base.getTime()).toBeLessThan(THIRTY_MIN_MS);
  });

  it("advanceByMs returns correct offset", () => {
    const base = new Date("2024-01-15T00:00:00.000Z");
    const result = advanceByMs(base, 1000);
    expect(result.getTime() - base.getTime()).toBe(1000);
  });

  it("advanceByDays returns correct offset", () => {
    const base = new Date("2024-01-15T00:00:00.000Z");
    const result = advanceByDays(base, 1);
    expect(result.getTime() - base.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
