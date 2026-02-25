import { createRouteHandler } from "@avenire/storage";
import { router } from "@/lib/upload";

export const { GET, POST } = createRouteHandler({
  router,
  config: {
    callbackUrl: "http://localhost:3000/api/uploadthing",
    isDev: true
  }
});
