// The server's messages are already plain English, so forms show them as they are. Validation failures also
// carry per-field details: [{ in, field, message }].
export function fieldErrors(error) {
  const out = {}
  for (const d of error?.details ?? []) if (d.field && !out[d.field]) out[d.field] = d.message
  return out
}

// The line shown above a form. Field-level problems are shown next to their fields instead.
export const formMessage = (error) => (error && Object.keys(fieldErrors(error)).length === 0 ? error.message : null)
