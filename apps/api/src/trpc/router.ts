import { router, publicProcedure } from "./trpc";
import { profileRouter } from "./profile";
import { rankingRouter } from "./ranking";
import { importRouter } from "./import";

export { router, publicProcedure };

export const appRouter = router({
  profile: profileRouter,
  ranking: rankingRouter,
  import: importRouter,
});

export type AppRouter = typeof appRouter;
