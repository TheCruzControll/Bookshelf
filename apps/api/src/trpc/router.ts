import { router, publicProcedure } from "./trpc";
import { profileRouter } from "./profile";
import { rankingRouter } from "./ranking";
import { shelfRouter } from "./shelf";
import { handleHistoryRouter } from "./handle-history";

export { router, publicProcedure };

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: "hone-api" })),
  profile: profileRouter,
  ranking: rankingRouter,
  shelf: shelfRouter,
  handleHistory: handleHistoryRouter,
});

export type AppRouter = typeof appRouter;
