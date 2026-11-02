import { randomUUID } from "node:crypto";
import pinoHttp from "pino-http";
import logger from "../lib/logger.js";

// A caller may supply its own id (useful behind a proxy), but only if it looks safe to log.
const SAFE_ID = /^[\w-]{8,64}$/;

// Sets req.id, the X-Request-Id response header, and req.log (a logger tagged with that id).
const requestLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && SAFE_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  // Log only what is needed. Default serializers would write headers, including cookies and tokens.
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

export default requestLogger;
