/**
 * Applies db/schema.sql once per network, substituting {{table}} with that
 * network's table name from the registry. Idempotent — every statement is
 * `if not exists`, so running it against a live database is safe.
 */

import { readFileSync } from "node:fs";
import { db, tableFor } from "../lib/db";
import { NETWORK_KEYS, NETWORKS } from "../lib/networks";

const template = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const sql = db();

/**
 * Splits the schema into statements.
 *
 * Comments are stripped *before* splitting on `;`, not filtered out after: a
 * comment containing a semicolon would otherwise be cut in half, leaving its
 * second fragment as the start of the next statement. (Our DDL has no `--`
 * inside a string literal, which is the case this would mishandle.)
 */
function statementsFor(table: string): string[] {
  return template
    .replaceAll("{{table}}", table)
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

for (const net of NETWORK_KEYS) {
  const table = tableFor(net);
  const statements = statementsFor(table);

  for (const statement of statements) {
    await sql.query(statement);
  }
  console.log(`${NETWORKS[net].name.padEnd(20)} ${table}  (${statements.length} statements applied)`);
}

console.log("\nMigration complete.");
