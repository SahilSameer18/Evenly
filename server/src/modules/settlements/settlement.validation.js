import { z } from "zod";

const id = z.string().min(1).max(64);

// The sender is always the person making the request, so the body names only who is being paid.
export const createSettlementBody = z.strictObject({
  toUserId: id,
  amountMinor: z.number().int("Must be a whole number of paise").positive().max(1_000_000_000),
  method: z.enum(["cash", "upi", "bank", "other"]),
  paymentReference: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().min(1).max(300).optional(),
});

// The recipient may say why they are rejecting; confirm and cancel take no body.
export const rejectBody = z.strictObject({ reason: z.string().trim().min(1).max(300).optional() }).default({});

export const listSettlementsQuery = z.strictObject({
  status: z.enum(["pending", "confirmed", "rejected", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(300).optional(),
});

export const settlementParams = z.strictObject({ householdId: id, settlementId: id });
