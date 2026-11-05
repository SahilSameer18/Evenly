# ADR 008: The monthly report

Status: accepted, 2026-11-05

## Context

People want to see where the money went: how much the household spent this month, how that compares with last month, and who has been paying more than their share. The charts and a shareable summary need one answer per month, with month edges that match how people actually think about dates.

## Decision

1. **`GET /households/:id/reports/monthly?month=YYYY-MM`** returns the month's shared spending, the previous month's, each person's paid and share for the month, and the last six months of spending (the trend). Left out, `month` means the current month. It is read-only and computed from the stored expenses; nothing is stored.
2. **Months follow the household's own timezone** (`Household.timezone`, default Asia/Kolkata), not UTC. 00:10 IST on 1 November is 18:40 UTC on 31 October and belongs to November. The month of an instant comes from `Intl.DateTimeFormat` with the household's zone (`monthOf`), so no timezone table is shipped.
3. **The same counting rules as the ledger.** Personal and reversed expenses never count, disputed ones do (`COUNTED_STATUS` is imported, not copied), and a refund counts the other way. A refund belongs to the month it was recorded in, not the month of the expense it refunds, which keeps past months from changing after the fact.
4. **Grouped in code, not in SQL.** The service loads the household's expenses (the same loader the balances use) and a pure function, `buildReport`, groups them. This keeps the rule testable without a database and identical to the ledger's. Empty months are zeros so the trend never has gaps.
5. **People shown:** current members always; someone who left only if they took part that month.
6. **The charts are drawn by hand in SVG and HTML**, with no chart library: it fits the design rules (no blur or shadows, nothing looping, one-shot opacity and transform motion), keeps the bundle small (the report screen is 3.8 KB gzipped) and lets the charts use the app's own colours. Every chart has a "view as table" and a keyboard route.
7. **The shareable summary is built on the device** from the same report (`summaryText`), so the text always matches the screen. It goes through the phone's share sheet, or is copied where there is none.

## Why

- **Household timezone:** a month boundary that disagrees with the calendar on the wall makes a report look wrong at exactly the moment people check it.
- **Reusing the ledger's rules:** two definitions of "counts" would drift apart, and a report that disagrees with the balances is worse than none.
- **In code:** a SQL month grouping would need the same timezone and status rules written a second time.

## Consequences

- Every report call loads the household's whole expense list (the same shortcut as balances, marked in the code). Fine at household size; revisit if ledgers grow large.
- Spending is shared spending only. A category breakdown waits for categories (there is no picker or endpoint yet).
- CSV export, the UPI payment link and closing a month (the rest of Phase 3.3) are separate work.
