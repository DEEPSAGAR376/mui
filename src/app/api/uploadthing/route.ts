/**
 * UploadThing's GET/POST handler. GET serves the route config to the client;
 * POST negotiates presigned URLs and receives the completion callback.
 */

import { createRouteHandler } from 'uploadthing/next';
import { ourFileRouter } from './core';

export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
  // Token comes from UPLOADTHING_TOKEN in the environment; no config needed.
});
