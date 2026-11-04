import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import env from "./config/env.js";
import prisma from "./lib/prisma.js";
import requestLogger from "./middlewares/requestLogger.js";
import { notFound, errorHandler } from "./middlewares/errorHandler.js";
import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import householdRoutes, { invitationRouter } from "./modules/households/household.routes.js";

const app = express();

// The number of proxies in front of the app comes from TRUST_PROXY; confirm it with the two-network rate-limit check (docs/RUNBOOK.md).
if (env.NODE_ENV === "production") app.set("trust proxy", env.TRUST_PROXY);

app.use(requestLogger);
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "database_unreachable" });
  }
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", usersRoutes);
app.use("/api/v1/households", householdRoutes);
app.use("/api/v1/invitations", invitationRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
