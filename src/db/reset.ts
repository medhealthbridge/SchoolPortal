import "./load-env";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
// Drizzle keeps its record of applied migrations in its own schema. Dropping
// only `public` leaves that record behind, so the next migrate believes the
// tables still exist and applies just the newest file onto an empty database.
await sql`drop schema if exists drizzle cascade`;
await sql`drop schema public cascade`;
await sql`create schema public`;
await sql`grant all on schema public to public`;
await sql.end();
console.log("✓ schema dropped — run npm run db:migrate next");
