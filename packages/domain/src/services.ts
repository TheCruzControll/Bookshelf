import type {
  ActivityRepository,
  AppRepositories,
  AuthProvider,
  ProfileRepository,
  ShelfRepository
} from "./ports";
import type { EntityId, Profile, ShelfItem } from "./types";

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

export class AppServices {
  readonly shelves: ShelfService;
  readonly handles: HandleService;

  constructor(
    readonly repositories: AppRepositories,
    readonly auth: AuthProvider
  ) {
    this.shelves = new ShelfService(
      repositories.shelves,
      repositories.activity
    );
    this.handles = new HandleService(repositories.profiles);
  }
}
