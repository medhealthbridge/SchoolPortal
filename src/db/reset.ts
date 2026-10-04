import "./load-env";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
await sql`drop schema public cascade`;
await sql`create schema public`;
await sql`grant all on schema public to public`;
await sql.end();
console.log("✓ schema dropped — run npm run db:push next");
