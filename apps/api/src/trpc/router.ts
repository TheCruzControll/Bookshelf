import { router, publicProcedure } from "./trpc";
import { profileRouter } from "./profile";
import { rankingRouter } from "./ranking";

export { router, publicProcedure };

export const appRouter = router({
  profile: profileRouter,
  ranking: rankingRouter,
});

export type AppRouter = typeof appRouter;
