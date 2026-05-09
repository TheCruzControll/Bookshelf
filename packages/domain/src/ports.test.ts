import { describe, it, expect } from "vitest";
import type {
  AppRepositories,
  AuthIdentityRepository,
  BlockRepository,
  ContactsRepository,
  FollowRepository,
  ImportRepository,
  ListRepository,
  NotificationRepository,
  RankingRepository,
  SessionRepository,
  ShelfRepository,
} from "./ports";

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
type _AppRepositoriesHasAuthIdentities = Assert<HasKey<AppRepositories, "authIdentities">>;

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
type _RankingRepositoryHasFindById = Assert<HasKey<RankingRepository, "findById">>;
type _RankingRepositoryHasFindByOwnerAndBook = Assert<HasKey<RankingRepository, "findByOwnerAndBook">>;
type _RankingRepositoryHasListByOwner = Assert<HasKey<RankingRepository, "listByOwner">>;
type _RankingRepositoryHasDelete = Assert<HasKey<RankingRepository, "delete">>;

type _NotificationRepositoryHasRegisterToken = Assert<HasKey<NotificationRepository, "registerToken">>;
type _NotificationRepositoryHasRemoveToken = Assert<HasKey<NotificationRepository, "removeToken">>;
type _NotificationRepositoryHasListTokensForProfile = Assert<HasKey<NotificationRepository, "listTokensForProfile">>;
type _NotificationRepositoryHasGetSetting = Assert<HasKey<NotificationRepository, "getSetting">>;
type _NotificationRepositoryHasSetSetting = Assert<HasKey<NotificationRepository, "setSetting">>;
type _NotificationRepositoryHasListSettings = Assert<HasKey<NotificationRepository, "listSettings">>;

type _ImportRepositoryHasCreate = Assert<HasKey<ImportRepository, "create">>;
type _ImportRepositoryHasFindById = Assert<HasKey<ImportRepository, "findById">>;
type _ImportRepositoryHasFindByOwnerAndHash = Assert<HasKey<ImportRepository, "findByOwnerAndHash">>;
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
type _SessionRepositoryHasFindByTokenHash = Assert<HasKey<SessionRepository, "findByTokenHash">>;
type _SessionRepositoryHasRevokeByTokenHash = Assert<HasKey<SessionRepository, "revokeByTokenHash">>;
type _SessionRepositoryHasRevokeAllForProfile = Assert<HasKey<SessionRepository, "revokeAllForProfile">>;

type _AuthIdentityRepositoryHasCreate = Assert<HasKey<AuthIdentityRepository, "create">>;
type _AuthIdentityRepositoryHasFindByProvider = Assert<HasKey<AuthIdentityRepository, "findByProvider">>;
type _AuthIdentityRepositoryHasListByProfile = Assert<HasKey<AuthIdentityRepository, "listByProfile">>;

type _ShelfRepositoryHasCreateSystemShelves = Assert<HasKey<ShelfRepository, "createSystemShelves">>;

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
  _RankingRepositoryHasFindById,
  _RankingRepositoryHasFindByOwnerAndBook,
  _RankingRepositoryHasListByOwner,
  _RankingRepositoryHasDelete,
  _NotificationRepositoryHasRegisterToken,
  _NotificationRepositoryHasRemoveToken,
  _NotificationRepositoryHasListTokensForProfile,
  _NotificationRepositoryHasGetSetting,
  _NotificationRepositoryHasSetSetting,
  _NotificationRepositoryHasListSettings,
  _ImportRepositoryHasCreate,
  _ImportRepositoryHasFindById,
  _ImportRepositoryHasFindByOwnerAndHash,
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
  _SessionRepositoryHasFindByTokenHash,
  _SessionRepositoryHasRevokeByTokenHash,
  _SessionRepositoryHasRevokeAllForProfile,
  _AppRepositoriesHasAuthIdentities,
  _AuthIdentityRepositoryHasCreate,
  _AuthIdentityRepositoryHasFindByProvider,
  _AuthIdentityRepositoryHasListByProfile,
  _ShelfRepositoryHasCreateSystemShelves,
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
      "authIdentities",
    ];
    expect(keys).toHaveLength(9);
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
});
