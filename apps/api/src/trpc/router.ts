import { router, publicProcedure } from "./trpc";
import { profileRouter } from "./profile";

export { router, publicProcedure };

export const appRouter = router({
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;
