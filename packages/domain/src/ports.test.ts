import { describe, it, expect } from "vitest";
import type {
  AppRepositories,
  BlockRepository,
  CatalogProvider,
  ContactsRepository,
  FollowRepository,
  ImportRepository,
  ListRepository,
  NotificationRepository,
  RankingRepository,
  SessionRepository,
} from "./ports";
import type { BookSearchResult } from "./types";

type HasKey<T, K extends keyof T> = K extends keyof T ? true : false;
type Assert<T extends true> = T;

type _AppRepositoriesHasFollows = Assert<HasKey<AppRepositories, "follows">>;
type _AppRepositoriesHasBlocks = Assert<HasKey<AppRepositories, "blocks">>;
type _AppRepositoriesHasRankings = Assert<HasKey<AppRepositories, "rankings">>;
type _AppRepositoriesHasNotifications = Assert<HasKey<AppRepositories, "notifications">>;
type _AppRepositoriesHasImports = Assert<HasKey<AppRepositories, "imports">>;
type _AppRepositoriesHasContacts = Assert<HasKey<AppRepositories, "contacts">>;
type _AppRepositoriesHasLists = Assert<HasKey<AppRepositories, "lists">>;
type _AppRepositoriesHasSessions = Assert<HasKey<AppRepositories, "sessions">>;

type _FollowRepositoryHasFollow = Assert<HasKey<FollowRepository, "follow">>;
type _FollowRepositoryHasUnfollow = Assert<HasKey<FollowRepository, "unfollow">>;
type _FollowRepositoryHasFindFollow = Assert<HasKey<FollowRepository, "findFollow">>;
type _FollowRepositoryHasListFollowers = Assert<HasKey<FollowRepository, "listFollowers">>;
type _FollowRepositoryHasListFollowing = Assert<HasKey<FollowRepository, "listFollowing">>;
type _FollowRepositoryHasIsMutual = Assert<HasKey<FollowRepository, "isMutual">>;

type _BlockRepositoryHasBlock = Assert<HasKey<BlockRepository, "block">>;
type _BlockRepositoryHasUnblock = Assert<HasKey<BlockRepository, "unblock">>;
type _BlockRepositoryHasFindBlock = Assert<HasKey<BlockRepository, "findBlock">>;
type _BlockRepositoryHasListBlockedByUser = Assert<HasKey<BlockRepository, "listBlockedByUser">>;
type _BlockRepositoryHasIsBlocked = Assert<HasKey<BlockRepository, "isBlocked">>;

type _RankingRepositoryHasUpsert = Assert<HasKey<RankingRepository, "upsert">>;
type _RankingRepositoryHasFindByOwnerAndBook = Assert<HasKey<RankingRepository, "findByOwnerAndBook">>;
type _RankingRepositoryHasListByOwner = Assert<HasKey<RankingRepository, "listByOwner">>;
type _RankingRepositoryHasDelete = Assert<HasKey<RankingRepository, "delete">>;

type _NotificationRepositoryHasRegisterToken = Assert<HasKey<NotificationRepository, "registerToken">>;
type _NotificationRepositoryHasRemoveToken = Assert<HasKey<NotificationRepository, "removeToken">>;
type _NotificationRepositoryHasListTokensForUser = Assert<HasKey<NotificationRepository, "listTokensForUser">>;

type _ImportRepositoryHasCreate = Assert<HasKey<ImportRepository, "create">>;
type _ImportRepositoryHasFindById = Assert<HasKey<ImportRepository, "findById">>;
type _ImportRepositoryHasListByOwner = Assert<HasKey<ImportRepository, "listByOwner">>;
type _ImportRepositoryHasUpdateStatus = Assert<HasKey<ImportRepository, "updateStatus">>;

type _ContactsRepositoryHasUpsertHashes = Assert<HasKey<ContactsRepository, "upsertHashes">>;
type _ContactsRepositoryHasFindMatches = Assert<HasKey<ContactsRepository, "findMatches">>;
type _ContactsRepositoryHasDeleteForUser = Assert<HasKey<ContactsRepository, "deleteForUser">>;
type _ContactsRepositoryHasDeleteExpired = Assert<HasKey<ContactsRepository, "deleteExpired">>;
type _ContactsRepositoryHasListByUser = Assert<HasKey<ContactsRepository, "listByUser">>;

type _ListRepositoryHasCreate = Assert<HasKey<ListRepository, "create">>;
type _ListRepositoryHasFindById = Assert<HasKey<ListRepository, "findById">>;
type _ListRepositoryHasListByOwner = Assert<HasKey<ListRepository, "listByOwner">>;
type _ListRepositoryHasUpdate = Assert<HasKey<ListRepository, "update">>;
type _ListRepositoryHasDelete = Assert<HasKey<ListRepository, "delete">>;
type _ListRepositoryHasAddItem = Assert<HasKey<ListRepository, "addItem">>;
type _ListRepositoryHasRemoveItem = Assert<HasKey<ListRepository, "removeItem">>;
type _ListRepositoryHasListItems = Assert<HasKey<ListRepository, "listItems">>;
type _ListRepositoryHasReorderItems = Assert<HasKey<ListRepository, "reorderItems">>;

type _SessionRepositoryHasCreate = Assert<HasKey<SessionRepository, "create">>;
type _SessionRepositoryHasFindById = Assert<HasKey<SessionRepository, "findById">>;
type _SessionRepositoryHasDeleteById = Assert<HasKey<SessionRepository, "deleteById">>;
type _SessionRepositoryHasDeleteAllForUser = Assert<HasKey<SessionRepository, "deleteAllForUser">>;

type _AppRepositoriesHasCatalog = Assert<HasKey<AppRepositories, "catalog">>;
type _CatalogProviderHasSearch = Assert<HasKey<CatalogProvider, "search">>;
type _CatalogProviderHasFindByIsbn = Assert<HasKey<CatalogProvider, "findByIsbn">>;

type _BookSearchResultHasSourceKey = Assert<HasKey<BookSearchResult, "sourceKey">>;
type _BookSearchResultHasSource = Assert<HasKey<BookSearchResult, "source">>;
type _BookSearchResultHasTitle = Assert<HasKey<BookSearchResult, "title">>;
type _BookSearchResultHasAuthors = Assert<HasKey<BookSearchResult, "authors">>;

export type {
  _AppRepositoriesHasFollows,
  _AppRepositoriesHasBlocks,
  _AppRepositoriesHasRankings,
  _AppRepositoriesHasNotifications,
  _AppRepositoriesHasImports,
  _AppRepositoriesHasContacts,
  _AppRepositoriesHasLists,
  _AppRepositoriesHasSessions,
  _FollowRepositoryHasFollow,
  _FollowRepositoryHasUnfollow,
  _FollowRepositoryHasFindFollow,
  _FollowRepositoryHasListFollowers,
  _FollowRepositoryHasListFollowing,
  _FollowRepositoryHasIsMutual,
  _BlockRepositoryHasBlock,
  _BlockRepositoryHasUnblock,
  _BlockRepositoryHasFindBlock,
  _BlockRepositoryHasListBlockedByUser,
  _BlockRepositoryHasIsBlocked,
  _RankingRepositoryHasUpsert,
  _RankingRepositoryHasFindByOwnerAndBook,
  _RankingRepositoryHasListByOwner,
  _RankingRepositoryHasDelete,
  _NotificationRepositoryHasRegisterToken,
  _NotificationRepositoryHasRemoveToken,
  _NotificationRepositoryHasListTokensForUser,
  _ImportRepositoryHasCreate,
  _ImportRepositoryHasFindById,
  _ImportRepositoryHasListByOwner,
  _ImportRepositoryHasUpdateStatus,
  _ContactsRepositoryHasUpsertHashes,
  _ContactsRepositoryHasFindMatches,
  _ContactsRepositoryHasDeleteForUser,
  _ContactsRepositoryHasDeleteExpired,
  _ContactsRepositoryHasListByUser,
  _ListRepositoryHasCreate,
  _ListRepositoryHasFindById,
  _ListRepositoryHasListByOwner,
  _ListRepositoryHasUpdate,
  _ListRepositoryHasDelete,
  _ListRepositoryHasAddItem,
  _ListRepositoryHasRemoveItem,
  _ListRepositoryHasListItems,
  _ListRepositoryHasReorderItems,
  _SessionRepositoryHasCreate,
  _SessionRepositoryHasFindById,
  _SessionRepositoryHasDeleteById,
  _SessionRepositoryHasDeleteAllForUser,
  _AppRepositoriesHasCatalog,
  _CatalogProviderHasSearch,
  _CatalogProviderHasFindByIsbn,
  _BookSearchResultHasSourceKey,
  _BookSearchResultHasSource,
  _BookSearchResultHasTitle,
  _BookSearchResultHasAuthors,
};

describe("ports structural smoke tests", () => {
  it("AppRepositories keys include all eight new repositories", () => {
    const keys: (keyof AppRepositories)[] = [
      "follows",
      "blocks",
      "rankings",
      "notifications",
      "imports",
      "contacts",
      "lists",
      "sessions",
    ];
    expect(keys).toHaveLength(8);
  });

  it("AppRepositories keys include all original repositories", () => {
    const keys: (keyof AppRepositories)[] = [
      "profiles",
      "books",
      "shelves",
      "reviews",
      "activity",
      "recommendations",
    ];
    expect(keys).toHaveLength(6);
  });

  it("AppRepositories includes catalog provider", () => {
    const keys: (keyof AppRepositories)[] = ["catalog"];
    expect(keys).toHaveLength(1);
  });

  it("CatalogProvider methods are search and findByIsbn", () => {
    const methods: (keyof CatalogProvider)[] = ["search", "findByIsbn"];
    expect(methods).toHaveLength(2);
  });

  it("BookSearchResult required fields cover OL and GB shapes", () => {
    const olResult: BookSearchResult = {
      sourceKey: "/works/OL82563W",
      source: "open_library",
      title: "The Great Gatsby",
      authors: ["F. Scott Fitzgerald"],
      firstPublishedYear: 1925,
      coverUrl: "https://covers.openlibrary.org/b/id/12345-L.jpg",
    };
    const gbResult: BookSearchResult = {
      sourceKey: "volumes/abc123",
      source: "google_books",
      title: "The Great Gatsby",
      authors: ["F. Scott Fitzgerald"],
      isbn13: "9780743273565",
      isbn10: "0743273567",
      publisher: "Scribner",
      publishedDate: "2004-09-30",
      pageCount: 180,
      description: "A classic novel.",
    };
    expect(olResult.source).toBe("open_library");
    expect(gbResult.source).toBe("google_books");
    expect(Array.isArray(olResult.authors)).toBe(true);
    expect(Array.isArray(gbResult.authors)).toBe(true);
  });
});
