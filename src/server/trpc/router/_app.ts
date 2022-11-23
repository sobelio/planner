import { router } from "../trpc";
import { authRouter } from "./auth";
import { eventsRouter } from "./events";
import { exampleRouter } from "./example";

export const appRouter = router({
  example: exampleRouter,
  auth: authRouter,
  events: eventsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
