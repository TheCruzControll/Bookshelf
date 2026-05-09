import type { Profile, Book, ShelfItem, Review, ActivityEvent } from "@hone/domain";
import {
  makeProfile,
  makeBook,
  makeEdition,
  makeShelf,
  makeShelfItem,
  makeReview,
  makeActivityEvent,
} from "./factories.js";

export interface FollowRelation {
  followerId: string;
  followeeId: string;
  mutual: boolean;
}

export interface FollowGraph {
  users: Profile[];
  follows: FollowRelation[];
  mutualPairs: Array<[Profile, Profile]>;
}

export function seedFollowGraph(options: {
  users?: number;
  mutualPairs?: number;
} = {}): FollowGraph {
  const userCount = options.users ?? 4;
  const mutualCount = Math.min(options.mutualPairs ?? 2, Math.floor(userCount / 2));

  const users: Profile[] = Array.from({ length: userCount }, () => makeProfile());
  const follows: FollowRelation[] = [];
  const mutualPairs: Array<[Profile, Profile]> = [];

  for (let i = 0; i < mutualCount; i++) {
    const a = users[i * 2];
    const b = users[i * 2 + 1];
    if (!a || !b) break;
    follows.push({ followerId: a.id, followeeId: b.id, mutual: true });
    follows.push({ followerId: b.id, followeeId: a.id, mutual: true });
    mutualPairs.push([a, b]);
  }

  const remaining = users.slice(mutualCount * 2);
  for (let i = 0; i < remaining.length - 1; i++) {
    const follower = remaining[i];
    const followee = remaining[i + 1];
    if (!follower || !followee) break;
    follows.push({ followerId: follower.id, followeeId: followee.id, mutual: false });
  }

  return { users, follows, mutualPairs };
}

export interface CatalogScene {
  books: Book[];
  editions: ReturnType<typeof makeEdition>[];
}

export function seedCatalog(options: {
  books?: number;
  withCovers?: boolean;
} = {}): CatalogScene {
  const bookCount = options.books ?? 10;
  const withCovers = options.withCovers ?? false;

  const books: Book[] = Array.from({ length: bookCount }, (_, i) =>
    makeBook({
      coverUrl: withCovers
        ? `https://covers.example.com/book-${i + 1}.jpg`
        : undefined,
    })
  );

  const editions = books.map((book) => makeEdition({ bookId: book.id }));

  return { books, editions };
}

export interface RankingState {
  owner: Profile;
  rankedItems: Array<{ shelfItem: ShelfItem; book: Book }>;
  shelf: ReturnType<typeof makeShelf>;
}

export function seedRankingState(options: {
  user?: Profile;
  ranks?: number;
} = {}): RankingState {
  const owner = options.user ?? makeProfile();
  const rankCount = options.ranks ?? 5;

  const shelf = makeShelf({
    ownerId: owner.id,
    name: "Finished",
    slug: "finished",
    isSystem: true,
  });

  const rankedItems = Array.from({ length: rankCount }, (_, i) => {
    const book = makeBook();
    const shelfItem = makeShelfItem({
      shelfId: shelf.id,
      bookId: book.id,
      status: "finished",
      rank: i + 1,
    });
    return { shelfItem, book };
  });

  return { owner, rankedItems, shelf };
}

export interface ReviewScene {
  author: Profile;
  reviews: Review[];
  books: Book[];
}

export function seedReviews(options: {
  author?: Profile;
  count?: number;
} = {}): ReviewScene {
  const author = options.author ?? makeProfile();
  const count = options.count ?? 3;

  const books: Book[] = Array.from({ length: count }, () => makeBook());
  const reviews: Review[] = books.map((book) =>
    makeReview({ authorId: author.id, bookId: book.id })
  );

  return { author, reviews, books };
}

export interface FeedScene {
  actor: Profile;
  viewer: Profile;
  events: ActivityEvent[];
  books: Book[];
}

export function seedFeedEvents(options: {
  actor?: Profile;
  viewer?: Profile;
  count?: number;
  withinGroupingWindow?: boolean;
} = {}): FeedScene {
  const actor = options.actor ?? makeProfile();
  const viewer = options.viewer ?? makeProfile();
  const count = options.count ?? 5;
  const withinGroupingWindow = options.withinGroupingWindow ?? false;

  const books: Book[] = Array.from({ length: count }, () => makeBook());

  const baseTime = new Date("2024-01-15T12:00:00.000Z");
  const events: ActivityEvent[] = books.map((book, i) => {
    const offsetMs = withinGroupingWindow
      ? i * 5 * 60 * 1000
      : i * 35 * 60 * 1000;
    const occurredAt = new Date(baseTime.getTime() - offsetMs);
    return makeActivityEvent({
      actorId: actor.id,
      verb: "book_finished",
      bookId: book.id,
      visibility: "public",
      occurredAt,
    });
  });

  return { actor, viewer, events, books };
}
