import { router, publicProcedure } from "./trpc";
import { accountRouter } from "./account";
import { authRouter } from "./auth";
import { blockRouter } from "./block";
import { contactsRouter } from "./contacts";
import { discoverRouter } from "./discover";
import { feedRouter } from "./feed";
import { followRouter } from "./follow";
import { importRouter } from "./import";
import { listRouter } from "./list";
import { notificationsRouter } from "./notifications";
import { profileRouter } from "./profile";
import { rankingRouter } from "./ranking";
import { recommendationsRouter } from "./recommendations";
import { reviewRouter } from "./review";
import { shelfRouter } from "./shelf";
import { shelfItemRouter } from "./shelf-item";

export { router, publicProcedure };

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: "hone-api" })),
  account: accountRouter,
  auth: authRouter,
  block: blockRouter,
  contacts: contactsRouter,
  discover: discoverRouter,
  feed: feedRouter,
  follow: followRouter,
  import: importRouter,
  list: listRouter,
  notifications: notificationsRouter,
  profile: profileRouter,
  ranking: rankingRouter,
  recommendations: recommendationsRouter,
  review: reviewRouter,
  shelf: shelfRouter,
  shelfItem: shelfItemRouter,
});

export type AppRouter = typeof appRouter;
