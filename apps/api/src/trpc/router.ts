import { router, publicProcedure } from "./trpc";
import { profileRouter } from "./profile";
import { rankingRouter } from "./ranking";
import { shelfRouter } from "./shelf";

export { router, publicProcedure };

export const appRouter = router({
  profile: profileRouter,
  ranking: rankingRouter,
  shelf: shelfRouter,
});

export type AppRouter = typeof appRouter;
