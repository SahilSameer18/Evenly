// An opaque pagination cursor: the sort position of the last item shown, as base64url JSON.
// It carries no authority. The query still applies every tenant and visibility filter, so a forged
// cursor can only move the starting point within data the caller may already see.

export function encodeCursor({ occurredAt, id }) {
  return Buffer.from(JSON.stringify({ t: occurredAt.toISOString(), id })).toString("base64url");
}

/** @returns {{ occurredAt: Date, id: string } | null} null when the cursor is not one we issued. */
export function decodeCursor(cursor) {
  try {
    const { t, id } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const occurredAt = new Date(t);
    if (typeof id !== "string" || !id || id.length > 64 || Number.isNaN(occurredAt.getTime())) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}
