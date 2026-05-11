import { router, publicProcedure } from "./trpc";
import { authRouter } from "./auth";
import { blockRouter } from "./block";
import { contactsRouter } from "./contacts";
import { feedRouter } from "./feed";
import { followRouter } from "./follow";
import { importRouter } from "./import";
import { listRouter } from "./list";
import { notificationsRouter } from "./notifications";
import { profileRouter } from "./profile";
import { rankingRouter } from "./ranking";
import { reviewRouter } from "./review";
import { shelfRouter } from "./shelf";
import { shelfItemRouter } from "./shelf-item";

export { router, publicProcedure };

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: "hone-api" })),
  auth: authRouter,
  block: blockRouter,
  contacts: contactsRouter,
  feed: feedRouter,
  follow: followRouter,
  import: importRouter,
  list: listRouter,
  notifications: notificationsRouter,
  profile: profileRouter,
  ranking: rankingRouter,
  review: reviewRouter,
  shelf: shelfRouter,
  shelfItem: shelfItemRouter,
});

export type AppRouter = typeof appRouter;
