-- Hand-written guards that Prisma cannot express. The database refuses bad money data
-- even if application code regresses (ledger invariants I1 and I6).

-- CHECK constraints
ALTER TABLE "Expense"
  ADD CONSTRAINT "expense_amount_positive" CHECK ("amountMinor" > 0);

ALTER TABLE "ExpenseSplit"
  ADD CONSTRAINT "split_share_non_negative" CHECK ("shareMinor" >= 0);

ALTER TABLE "Settlement"
  ADD CONSTRAINT "settlement_amount_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "settlement_not_self" CHECK ("fromUserId" <> "toUserId");

-- I1: the splits of an expense must add up to its amount.
-- Deferred, so it is checked at COMMIT and rows can be inserted in any order inside one transaction.
CREATE FUNCTION check_expense_split_sum() RETURNS trigger AS $$
DECLARE
  eid text;
  expected integer;
  actual bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    eid := OLD."expenseId";
  ELSIF TG_TABLE_NAME = 'Expense' THEN
    eid := NEW."id";
  ELSE
    eid := NEW."expenseId";
  END IF;

  SELECT "amountMinor" INTO expected FROM "Expense" WHERE "id" = eid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM("shareMinor"), 0) INTO actual FROM "ExpenseSplit" WHERE "expenseId" = eid;
  IF actual <> expected THEN
    RAISE EXCEPTION 'Expense % splits (%) do not add up to its amount (%)', eid, actual, expected
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "expense_split_sum_on_expense"
  AFTER INSERT OR UPDATE OF "amountMinor" ON "Expense"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_expense_split_sum();

CREATE CONSTRAINT TRIGGER "expense_split_sum_on_split"
  AFTER INSERT OR UPDATE OR DELETE ON "ExpenseSplit"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_expense_split_sum();

-- I6: audit history is append-only.
CREATE FUNCTION reject_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_event_append_only"
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION reject_audit_change();
