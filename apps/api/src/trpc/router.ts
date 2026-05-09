import { router, publicProcedure } from "./trpc";
import { authRouter } from "./auth";
import { profileRouter } from "./profile";
import { rankingRouter } from "./ranking";
import { reviewRouter } from "./review";
import { shelfRouter } from "./shelf";

export { router, publicProcedure };

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: "hone-api" })),
  auth: authRouter,
  profile: profileRouter,
  ranking: rankingRouter,
  review: reviewRouter,
  shelf: shelfRouter,
});

export type AppRouter = typeof appRouter;
