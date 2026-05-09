import { createHash } from "node:crypto";
import type {
  ActivityRepository,
  AppRepositories,
  AuthProvider,
  ImportRepository,
  ProfileRepository,
  RankingRepository,
  ShelfRepository
} from "./ports";
import type { EntityId, Import, ImportSource, ImportStatus, Profile, Ranking, Shelf, ShelfItem, Visibility } from "./types";

export interface SystemShelfDef {
  name: string;
  slug: string;
  visibility: Visibility;
}

export const SYSTEM_SHELVES: SystemShelfDef[] = [
  { name: "Reading", slug: "reading", visibility: "followers" },
  { name: "Want to Read", slug: "want-to-read", visibility: "followers" },
  { name: "Finished", slug: "finished", visibility: "public" },
  { name: "Dropped", slug: "dropped", visibility: "followers" },
];

export class ShelfService {
  constructor(
    private readonly shelves: ShelfRepository,
    private readonly activity: ActivityRepository
  ) {}

  async addBookToShelf(input: {
    ownerId: EntityId;
    shelfId: EntityId;
    bookId: EntityId;
    editionId?: EntityId | undefined;
  }): Promise<ShelfItem> {
    const shelfItem = await this.shelves.addBook(input);

    await this.activity.append({
      actorId: input.ownerId,
      verb: "book_added",
      bookId: input.bookId,
      shelfId: input.shelfId,
      visibility: "followers"
    });

    return shelfItem;
  }
}

export const RESERVED_HANDLES = new Set([
  "admin",
  "administrator",
  "root",
  "superuser",
  "support",
  "help",
  "info",
  "contact",
  "api",
  "www",
  "mail",
  "email",
  "noreply",
  "no-reply",
  "postmaster",
  "webmaster",
  "hostmaster",
  "security",
  "abuse",
  "billing",
  "legal",
  "privacy",
  "terms",
  "team",
  "staff",
  "mod",
  "moderator",
  "official",
  "hone",
  "honeteam",
  "anonymous",
  "system",
  "null",
  "undefined",
  "me",
  "you",
  "user",
  "username",
  "account",
  "profile",
  "settings",
  "notifications",
  "feed",
  "home",
  "discover",
  "search",
  "explore",
]);

export class HandleService {
  constructor(private readonly profiles: ProfileRepository) {}

  isReserved(handle: string): boolean {
    return RESERVED_HANDLES.has(handle.toLowerCase());
  }

  async isAvailable(handle: string): Promise<boolean> {
    if (this.isReserved(handle)) return false;
    const taken = await this.profiles.isHandleTaken(handle.toLowerCase());
    return !taken;
  }

  generateSuggestions(base: string): string[] {
    const lower = base.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const suggestions: string[] = [];
    const suffixes = [
      String(Math.floor(Math.random() * 90 + 10)),
      String(new Date().getFullYear()),
      "_reads",
      "_books",
      "_hone",
    ];
    for (const suffix of suffixes) {
      const candidate = `${lower}${suffix}`;
      if (candidate.length >= 3 && candidate.length <= 30) {
        suggestions.push(candidate);
      }
    }
    return suggestions.slice(0, 3);
  }

  async checkHandle(handle: string): Promise<{ available: boolean; suggestions: string[] }> {
    const available = await this.isAvailable(handle);
    const suggestions = available ? [] : this.generateSuggestions(handle);
    return { available, suggestions };
  }

  async setHandle(userId: EntityId, handle: string): Promise<Profile> {
    const available = await this.isAvailable(handle);
    if (!available) {
      const suggestions = this.generateSuggestions(handle);
      throw Object.assign(new Error("Handle is not available"), {
        code: "HANDLE_TAKEN",
        suggestions,
      });
    }
    return this.profiles.setHandle({ userId, handle: handle.toLowerCase() });
  }
}

export class ProfileService {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly shelves: ShelfRepository
  ) {}

  async createProfile(input: {
    id: EntityId;
    handle: string;
    displayName: string;
    defaultVisibility: Visibility;
  }): Promise<{ profile: Profile; shelves: Shelf[] }> {
    const profile = await this.profiles.create(input);
    const systemShelves = await this.shelves.createSystemShelves(profile.id);
    return { profile, shelves: systemShelves };
  }
}

export class RankingService {
  constructor(private readonly rankings: RankingRepository) {}

  async startBucket(input: {
    ownerId: EntityId;
    bookId: EntityId;
    bucket: number;
  }): Promise<Ranking> {
    return this.rankings.startBucket(input);
  }
}

export const VALID_STATUS_TRANSITIONS: Record<ImportStatus, ImportStatus[]> = {
  pending: ["processing", "failed"],
  processing: ["needs_review", "completed", "failed"],
  needs_review: ["processing", "completed", "failed"],
  completed: [],
  failed: [],
};

export function hashFileContent(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export class ImportService {
  constructor(private readonly imports: ImportRepository) {}

  async createImport(input: {
    id: EntityId;
    ownerId: EntityId;
    source: ImportSource;
    fileContent: string | Uint8Array;
  }): Promise<{ import: Import; duplicate: boolean }> {
    const idempotencyHash = hashFileContent(input.fileContent);
    const existing = await this.imports.findByOwnerAndHash({
      ownerId: input.ownerId,
      hash: idempotencyHash,
    });
    if (existing) {
      return { import: existing, duplicate: true };
    }
    const created = await this.imports.create({
      id: input.id,
      ownerId: input.ownerId,
      source: input.source,
      idempotencyHash,
    });
    return { import: created, duplicate: false };
  }

  async transitionStatus(input: {
    id: EntityId;
    toStatus: ImportStatus;
  }): Promise<Import> {
    const existing = await this.imports.findById(input.id);
    if (!existing) {
      throw Object.assign(new Error("Import not found"), { code: "IMPORT_NOT_FOUND" });
    }
    const allowed = VALID_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.toStatus)) {
      throw Object.assign(
        new Error(`Invalid status transition: ${existing.status} -> ${input.toStatus}`),
        { code: "INVALID_STATUS_TRANSITION" }
      );
    }
    const completedAt =
      input.toStatus === "completed" || input.toStatus === "failed" ? new Date() : undefined;
    return this.imports.updateStatus({
      id: input.id,
      status: input.toStatus,
      completedAt,
    });
  }

  async findById(id: EntityId): Promise<Import | null> {
    return this.imports.findById(id);
  }

  async listByOwner(ownerId: EntityId): Promise<Import[]> {
    return this.imports.listByOwner(ownerId);
  }
}

export class AppServices {
  readonly shelves: ShelfService;
  readonly handles: HandleService;
  readonly profiles: ProfileService;
  readonly rankings: RankingService;
  readonly imports: ImportService;

  constructor(
    readonly repositories: AppRepositories,
    readonly auth: AuthProvider
  ) {
    this.shelves = new ShelfService(
      repositories.shelves,
      repositories.activity
    );
    this.handles = new HandleService(repositories.profiles);
    this.profiles = new ProfileService(
      repositories.profiles,
      repositories.shelves
    );
    this.rankings = new RankingService(repositories.rankings);
    this.imports = new ImportService(repositories.imports);
  }
}
