/**
 * A school's own database: created on the same server as the shared one,
 * brought to the current schema, and given a copy of the school's row so its
 * records have something to point at.
 *
 * Creating a database needs the owner connection (DATABASE_URL). The app
 * reaches the new database with its usual login afterwards, so nothing new has
 * to be stored anywhere.
 */
import postgres from "postgres";
import { withDatabaseName } from "./index";
import { prepareDatabase } from "./prepare";
import type { schools } from "./schema";

/** sp_ and the school's address, which is already lowercase letters, digits and hyphens. */
export function databaseNameFor(subdomain: string) {
  return `sp_${subdomain.toLowerCase().replace(/-/g, "_")}`.slice(0, 63);
}

function ownerUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("A school database can only be created where DATABASE_URL (the owner connection) is set.");
  return url;
}

type SchoolRow = typeof schools.$inferInsert & { id: string };

export async function createSchoolDatabase(name: string, school: SchoolRow) {
  const owner = ownerUrl();
  withDatabaseName(owner, name); // refuses a name that is not one of ours

  const admin = postgres(owner, { max: 1, onnotice: () => {} });
  try {
    const [exists] = await admin`select 1 from pg_database where datname = ${name}`;
    if (exists) throw new Error(`A database called ${name} already exists.`);
    // An identifier cannot be a bound parameter; the name was checked above.
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  try {
    await prepareDatabase(withDatabaseName(owner, name));
    const home = postgres(withDatabaseName(owner, name), { max: 1, onnotice: () => {} });
    try {
      // The copy only anchors foreign keys. The shared database stays the
      // record of the school's name, plan and status.
      await home`insert into schools ${home({
        id: school.id,
        subdomain: school.subdomain,
        name: school.name,
        owner_name: school.ownerName,
        owner_email: school.ownerEmail,
        database_name: name,
      })}`;
    } finally {
      await home.end();
    }
  } catch (err) {
    await dropSchoolDatabase(name).catch(() => {});
    throw err;
  }
}

/** Only for undoing a creation that did not finish. */
export async function dropSchoolDatabase(name: string) {
  const owner = ownerUrl();
  withDatabaseName(owner, name);
  const admin = postgres(owner, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
  } finally {
    await admin.end();
  }
}
