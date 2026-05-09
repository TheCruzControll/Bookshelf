import { router, publicProcedure } from "./trpc";
import { profileRouter } from "./profile";
import { rankingRouter } from "./ranking";

export { router, publicProcedure };

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: "hone-api" })),
  profile: profileRouter,
  ranking: rankingRouter,
});

export type AppRouter = typeof appRouter;
