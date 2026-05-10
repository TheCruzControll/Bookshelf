import type {
  Profile,
  Book,
  Edition,
  Shelf,
  ShelfItem,
  Review,
  ActivityEvent,
  Author,
  FeedItem,
  Recommendation,
  EntityId,
  Visibility,
  ReadingStatus,
  ActivityVerb,
} from "@hone/domain";
import { POSTURE_C_DEFAULTS } from "@hone/domain";

let _counter = 0;
function nextId(): EntityId {
  return `test-id-${++_counter}`;
}

function now(): Date {
  return new Date("2024-01-15T12:00:00.000Z");
}

export function resetCounter(): void {
  _counter = 0;
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  const id = nextId();
  return {
    id,
    handle: `user_${id}`,
    displayName: `Test User ${id}`,
    bio: undefined,
    avatarUrl: undefined,
    defaultVisibility: POSTURE_C_DEFAULTS,
    version: 1,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  } as Profile;
}

export function makeAuthor(overrides: Partial<Author> = {}): Author {
  const id = nextId();
  return {
    id,
    name: `Author ${id}`,
    ...overrides,
  };
}

export function makeBook(overrides: Partial<Book> = {}): Book {
  const id = nextId();
  return {
    id,
    canonicalTitle: `Test Book ${id}`,
    subtitle: undefined,
    description: `Description for test book ${id}`,
    coverUrl: undefined,
    firstPublishedYear: 2020,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

export function makeEdition(overrides: Partial<Edition> = {}): Edition {
  const id = nextId();
  const bookId = overrides.bookId ?? nextId();
  return {
    id,
    bookId,
    isbn10: undefined,
    isbn13: `978000000${String(_counter).padStart(4, "0")}`,
    title: `Test Edition ${id}`,
    publisher: "Test Publisher",
    publishedDate: "2020-01-01",
    pageCount: 300,
    source: "open_library",
    sourceKey: `/books/OL${id}M`,
    ...overrides,
  };
}

export function makeShelf(overrides: Partial<Shelf> = {}): Shelf {
  const id = nextId();
  const ownerId = overrides.ownerId ?? nextId();
  return {
    id,
    ownerId,
    name: `Test Shelf ${id}`,
    slug: `test-shelf-${id}`,
    visibility: "public",
    isSystem: false,
    kind: "custom",
    authorType: "user",
    version: 1,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  } as Shelf;
}

export function makeShelfItem(overrides: Partial<ShelfItem> = {}): ShelfItem {
  const id = nextId();
  const shelfId = overrides.shelfId ?? nextId();
  const bookId = overrides.bookId ?? nextId();
  return {
    id,
    shelfId,
    bookId,
    editionId: undefined,
    status: "finished",
    rank: undefined,
    addedAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

export function makeReview(overrides: Partial<Review> = {}): Review {
  const id = nextId();
  const authorId = overrides.authorId ?? nextId();
  const bookId = overrides.bookId ?? nextId();
  return {
    id,
    authorId,
    bookId,
    editionId: undefined,
    body: `This is a test review for book ${bookId}.`,
    visibility: "public",
    version: 1,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  } as Review;
}

export function makeActivityEvent(
  overrides: Partial<ActivityEvent> = {}
): ActivityEvent {
  const id = nextId();
  const actorId = overrides.actorId ?? nextId();
  return {
    id,
    actorId,
    verb: "book_finished",
    bookId: undefined,
    shelfId: undefined,
    reviewId: undefined,
    visibility: "public",
    occurredAt: now(),
    ...overrides,
  };
}

export function makeFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  const actor = overrides.actor ?? makeProfile();
  const event =
    overrides.event ??
    makeActivityEvent({ actorId: actor.id, verb: "book_finished" });
  const book = overrides.book ?? makeBook();
  return {
    event,
    actor,
    book,
    shelf: undefined,
    review: undefined,
    ...overrides,
  };
}

export function makeRecommendation(
  overrides: Partial<Recommendation> = {}
): Recommendation {
  const book = overrides.book ?? makeBook();
  return {
    book,
    score: 8.5,
    reason: "popular_in_network",
    ...overrides,
  };
}

export interface RankingEntry {
  shelfItem: ShelfItem;
  book: Book;
}

export function makeRanking(
  overrides: Partial<{
    shelfItem: Partial<ShelfItem>;
    book: Partial<Book>;
  }> = {}
): RankingEntry {
  const book = makeBook(overrides.book ?? {});
  const shelfItem = makeShelfItem({
    bookId: book.id,
    status: "finished",
    rank: 1,
    ...overrides.shelfItem,
  });
  return { shelfItem, book };
}
