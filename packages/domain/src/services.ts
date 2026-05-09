import type {
  ActivityRepository,
  AppRepositories,
  AuthProvider,
  ProfileRepository,
  RankingRepository,
  ShelfRepository
} from "./ports";
import type { EntityId, Profile, Ranking, Shelf, ShelfItem, Visibility } from "./types";

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

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class ShelfService {
  constructor(
    private readonly shelves: ShelfRepository,
    private readonly activity: ActivityRepository
  ) {}

  async createShelf(input: {
    ownerId: EntityId;
    name: string;
    visibility: Visibility;
  }): Promise<Shelf> {
    const slug = slugify(input.name);
    return this.shelves.create({
      ownerId: input.ownerId,
      name: input.name,
      slug,
      visibility: input.visibility,
    });
  }

  async updateShelf(input: {
    id: EntityId;
    ownerId: EntityId;
    name?: string | undefined;
    visibility?: Visibility | undefined;
    description?: string | undefined;
  }): Promise<Shelf> {
    const shelf = await this.shelves.findById(input.id);
    if (!shelf) {
      throw Object.assign(new Error("Shelf not found"), { code: "NOT_FOUND" });
    }
    if (shelf.ownerId !== input.ownerId) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }
    if (shelf.isSystem) {
      throw Object.assign(new Error("Cannot modify system shelf"), { code: "FORBIDDEN" });
    }
    return this.shelves.update(input);
  }

  async deleteShelf(input: {
    id: EntityId;
    ownerId: EntityId;
  }): Promise<void> {
    const shelf = await this.shelves.findById(input.id);
    if (!shelf) {
      throw Object.assign(new Error("Shelf not found"), { code: "NOT_FOUND" });
    }
    if (shelf.ownerId !== input.ownerId) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }
    if (shelf.isSystem) {
      throw Object.assign(new Error("Cannot delete system shelf"), { code: "FORBIDDEN" });
    }
    await this.shelves.delete(input);
  }

  async listShelves(ownerId: EntityId, viewerId?: EntityId): Promise<Shelf[]> {
    return this.shelves.listShelves(ownerId, viewerId);
  }

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

export class AppServices {
  readonly shelves: ShelfService;
  readonly handles: HandleService;
  readonly profiles: ProfileService;
  readonly rankings: RankingService;

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
  }
}
