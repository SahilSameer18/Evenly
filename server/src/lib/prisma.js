import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";
import env from "../config/env.js";

// Enable WebSocket connection in Node.js runtime for Neon serverless driver
neonConfig.webSocketConstructor = ws;

const connectionString = env.DATABASE_URL;

const adapter = new PrismaNeon({ connectionString });

const prisma = new PrismaClient({ adapter });

export default prisma;

