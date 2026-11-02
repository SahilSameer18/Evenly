import { randomUUID } from "node:crypto";
import prisma from "../src/lib/prisma.js";
import { splitEqual, calculateMemberBalances } from "../src/ledger/index.js";

const DAY = 86_400_000;
// Placeholder: demo accounts cannot log in until real password hashing exists (phase 1.5).
const NO_LOGIN = "!seed-account-no-login";

if (await prisma.user.findUnique({ where: { email: "asha@demo.evenly.test" } })) {
  console.log("Demo data already present, nothing to do.");
  await prisma.$disconnect();
  process.exit(0);
}

const asha = await prisma.user.create({ data: { email: "asha@demo.evenly.test", name: "Asha", passwordHash: NO_LOGIN } });
const ravi = await prisma.user.create({ data: { email: "ravi@demo.evenly.test", name: "Ravi", passwordHash: NO_LOGIN } });

const household = await prisma.household.create({
  data: {
    name: "Flat 302",
    members: { create: [{ userId: asha.id, role: "owner" }, { userId: ravi.id }] },
  },
});

const categories = {};
for (const name of ["Groceries", "Utilities", "Household", "Personal"]) {
  categories[name] = await prisma.category.create({ data: { householdId: household.id, name } });
}

// The worked example from docs/LEDGER.md: Asha ends at +300 rupees, Ravi at -300.
const samples = [
  { by: asha, description: "Groceries", amountMinor: 200000, category: "Groceries", daysAgo: 6 },
  { by: ravi, description: "Electricity bill", amountMinor: 120000, category: "Utilities", daysAgo: 5 },
  { by: ravi, description: "Wi-Fi", amountMinor: 80000, category: "Utilities", daysAgo: 4 },
  { by: asha, description: "Kitchen supplies", amountMinor: 60000, category: "Household", daysAgo: 3 },
  { by: asha, description: "Headphones", amountMinor: 150000, category: "Personal", daysAgo: 2, type: "personal" },
];

for (const s of samples) {
  const id = randomUUID(); // the expense id is also the split tie-break seed
  const type = s.type ?? "shared";
  const people = type === "personal" ? [s.by.id] : [asha.id, ravi.id];
  const splits = splitEqual(s.amountMinor, people, id);
  await prisma.$transaction(async (tx) => {
    await tx.expense.create({
      data: {
        id,
        householdId: household.id,
        createdById: s.by.id,
        paidById: s.by.id,
        categoryId: categories[s.category].id,
        description: s.description,
        amountMinor: s.amountMinor,
        type,
        splitMethod: "equal",
        occurredAt: new Date(Date.now() - s.daysAgo * DAY),
        splits: { create: splits.map((x) => ({ householdId: household.id, userId: x.userId, shareMinor: x.shareMinor })) },
      },
    });
    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorUserId: s.by.id,
        entityType: "expense",
        entityId: id,
        action: "expense.created",
        after: { description: s.description, amountMinor: s.amountMinor, type, splits },
      },
    });
  });
}

// Pending repayments never change balances.
await prisma.settlement.create({
  data: { householdId: household.id, fromUserId: ravi.id, toUserId: asha.id, createdById: ravi.id, amountMinor: 10000, method: "upi", note: "Part of electricity" },
});

const [expenses, settlements] = await Promise.all([
  prisma.expense.findMany({ where: { householdId: household.id }, include: { splits: true } }),
  prisma.settlement.findMany({ where: { householdId: household.id } }),
]);
const net = calculateMemberBalances({
  memberIds: [asha.id, ravi.id],
  expenses: expenses.map((e) => ({ paidBy: e.paidById, amountMinor: e.amountMinor, type: e.type, status: e.status, splits: e.splits })),
  settlements: settlements.map((t) => ({ fromUserId: t.fromUserId, toUserId: t.toUserId, amountMinor: t.amountMinor, status: t.status })),
});
if (net[asha.id] !== 30000 || net[ravi.id] !== -30000) {
  throw new Error(`Seed balances are wrong: ${JSON.stringify(net)}`);
}

console.log(`Seeded "${household.name}": ${expenses.length} expenses, ${settlements.length} pending repayment.`);
console.log(`Balances: Asha ${net[asha.id] / 100} rupees, Ravi ${net[ravi.id] / 100} rupees.`);
await prisma.$disconnect();
