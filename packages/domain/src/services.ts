import type {
  ActivityRepository,
  AppRepositories,
  AuthProvider,
  ShelfRepository
} from "./ports";
import type { EntityId, ShelfItem } from "./types";

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

export class AppServices {
  readonly shelves: ShelfService;

  constructor(
    readonly repositories: AppRepositories,
    readonly auth: AuthProvider
  ) {
    this.shelves = new ShelfService(
      repositories.shelves,
      repositories.activity
    );
  }
}
