import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is not set. Point it at a separate Neon branch, never the dev database.");
}
if (url === process.env.DEV_DATABASE_URL || url === process.env.DEV_DIRECT_URL) {
  throw new Error("TEST_DATABASE_URL must not be the dev database: tests wipe every table.");
}

export const testDb = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });

/** Empty every table between tests. TRUNCATE is not blocked by the audit-log trigger. */
export async function resetDb() {
  await testDb.$executeRawUnsafe(
    'TRUNCATE "AuditEvent", "Settlement", "ExpenseSplit", "Expense", "Category", "Invitation", "HouseholdMember", "Household", "User" RESTART IDENTITY CASCADE',
  );
}
