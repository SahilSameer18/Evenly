import pino from "pino";
import env from "../config/env.js";

const logger = pino({ level: env.NODE_ENV === "test" ? "silent" : "info" });

export default logger;
