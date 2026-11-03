import { z } from "zod";

const id = z.string().min(1).max(64);
const FIVE_MINUTES = 5 * 60 * 1000;

// The future check reads the clock inside the refine, so it runs on every request, never when the module loads.
const occurredAt = z.iso
  .datetime({ offset: true })
  .transform((s) => new Date(s))
  .pipe(z.date().refine((d) => d.getTime() <= Date.now() + FIVE_MINUTES, "Cannot be in the future"));

const common = {
  description: z.string().trim().min(1, "Required").max(140),
  notes: z.string().trim().max(1000).optional(),
  amountMinor: z.number().int("Must be a whole number of paise").positive().max(1_000_000_000),
  categoryId: id.optional(),
  occurredAt: occurredAt.optional(),
};

const people = z.number().int().min(0);
const split = z.discriminatedUnion("method", [
  z.strictObject({ method: z.literal("equal"), participants: z.array(id).min(1).max(20) }),
  z.strictObject({
    method: z.literal("exact"),
    shares: z.array(z.strictObject({ userId: id, shareMinor: people.max(1_000_000_000) })).min(1).max(20),
  }),
  z.strictObject({
    method: z.literal("percentage"),
    parts: z.array(z.strictObject({ userId: id, bps: people.max(10_000) })).min(1).max(20),
  }),
  z.strictObject({
    method: z.literal("weights"),
    parts: z.array(z.strictObject({ userId: id, weight: people.max(10_000) })).min(1).max(20),
  }),
]);

// The three kinds of expense have different shapes, so the body is a union on `type`.
// shared:    split between members however `split` says. The payer need not be one of them.
// personal:  only the payer's own; no split, no payer field. Never counts in household balances.
// on_behalf: the payer covered something for one other member, who owes 100%.
export const createExpenseBody = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("shared"), paidById: id.optional(), split, ...common }),
  z.strictObject({ type: z.literal("on_behalf"), paidById: id.optional(), beneficiaryId: id, ...common }),
  z.strictObject({ type: z.literal("personal"), ...common }),
]);

const isoDateTime = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

export const listExpensesQuery = z.strictObject({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  categoryId: id.optional(),
  paidById: id.optional(),
  type: z.enum(["shared", "personal", "on_behalf"]).optional(),
  status: z.enum(["confirmed", "disputed", "reversed"]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(300).optional(),
});

// mergeParams makes the household id visible to the expense routes as well.
export const expenseParams = z.strictObject({ householdId: id, expenseId: id });
