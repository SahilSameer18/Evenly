import "dotenv/config";
import pg from "pg";

// Database tests wipe and refill the test database, so two test runs at once would corrupt each other.
// This takes a PostgreSQL advisory lock for the whole run. A second run cannot get it and stops at once,
// before it touches any data. The lock belongs to the connection, so it is released when this run ends,
// and also if the process dies.

const LOCK_KEY = 8_271_904; // any number, as long as every run uses the same one
let holder;

// Throwing from here made Vitest crash while formatting the error (a stack-trace bug), hiding the reason.
// Printing the message and exiting is blunt but always readable.
function refuse(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

export async function setup() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) return; // without a test database the database tests are skipped, so there is nothing to protect

  // A session lock needs a direct connection; the pooled endpoint can hand the session to someone else.
  const url = process.env.TEST_DIRECT_URL ?? testUrl.replace("-pooler", "");
  const host = (u) => new URL(u).hostname.replace("-pooler", "");
  if ([process.env.DATABASE_URL, process.env.DIRECT_URL].some((dev) => dev && host(dev) === host(url))) {
    refuse("TEST_DATABASE_URL points at the dev database. Tests wipe every table, so they refuse to run.");
  }

  holder = new pg.Client({ connectionString: url });
  await holder.connect();
  const { rows } = await holder.query("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_KEY]);
  if (!rows[0].locked) {
    await holder.end();
    holder = undefined;
    refuse(
      "Another test run is already using the test database. Wait for it to finish (or stop it) and try again.\n" +
        "Running two at once would wipe each other's data.",
    );
  }
}

export async function teardown() {
  await holder?.end(); // closing the connection releases the lock
  holder = undefined;
}
