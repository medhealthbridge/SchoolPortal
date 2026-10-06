import "../src/db/load-env";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { homeOf, withDatabaseName, withSchoolAccount, withTenant } from "@/db";
import { databaseNameFor } from "@/db/provision";
import { prepareDatabase } from "@/db/prepare";
import { sessions, students, subscriptions, users } from "@/db/schema";
import { createSchoolWithOwner, ownDatabaseByDefault } from "@/lib/onboarding";
import { hashPassword } from "@/lib/password";
import { enabledModules } from "@/lib/tenant";
import { dropSchool, makeSchool } from "./helpers";

const stamp = Date.now().toString(36);
const made: string[] = [];
const owner = process.env.DATABASE_URL!;

afterAll(async () => {
  for (const id of made) await dropSchool(id);
});

async function newOwnSchool(name: string) {
  const school = await createSchoolWithOwner({
    subdomain: `${name}-${stamp}`,
    name: `Own ${name}`,
    type: "k12",
    tier: "all_in",
    ownerName: "Olga Owner",
    ownerEmail: `olga@${name}.test`,
    passwordHash: await hashPassword("a-long-owner-password"),
    branchNames: ["Main campus"],
    actorLabel: "test",
    action: "school.created_by_platform",
    ownDatabase: true,
  });
  made.push(school.id);
  return school;
}

/** Rows as the owner sees them, past row-level security, in one database. */
async function rawCount(url: string, table: string, schoolId: string) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql.unsafe(`select count(*)::int as n from "${table}" where school_id = $1`, [schoolId]);
    return row.n as number;
  } finally {
    await sql.end();
  }
}

describe("a school with its own database", () => {
  it("names the database after the address", () => {
    expect(databaseNameFor("san-isidro-academy")).toBe("sp_san_isidro_academy");
    expect(() => withDatabaseName(owner, "Robert'); drop table schools;--")).toThrow();
  });

  it("keeps its people and records in its own database, not the shared one", async () => {
    const school = await newOwnSchool("alpha");
    expect(school.databaseName).toBe(databaseNameFor(`alpha-${stamp}`));
    const own = withDatabaseName(owner, school.databaseName!);

    expect(await rawCount(own, "users", school.id)).toBe(1);
    expect(await rawCount(owner, "users", school.id)).toBe(0);
    expect(await rawCount(own, "school_modules", school.id)).toBeGreaterThan(0);
    expect(await rawCount(owner, "school_modules", school.id)).toBe(0);

    await withTenant(school.id, (tx) =>
      tx.insert(students).values({
        schoolId: school.id,
        studentNumber: "A-1",
        firstName: "Ana",
        lastName: "Cruz",
        activationCode: `act-${stamp}`,
        parentCode: `par-${stamp}`,
      }),
    );
    expect(await rawCount(own, "students", school.id)).toBe(1);
    expect(await rawCount(owner, "students", school.id)).toBe(0);

    // The app reads it back through the usual door.
    const found = await withTenant(school.id, (tx) =>
      tx.select().from(students).where(and(eq(students.schoolId, school.id), eq(students.studentNumber, "A-1"))),
    );
    expect(found).toHaveLength(1);
    expect((await enabledModules(school.id)).has("grades")).toBe(true);
  });

  it("keeps the school's plan and invoices in the shared database", async () => {
    const subs = await withSchoolAccount(made[0], (tx) =>
      tx.select().from(subscriptions).where(eq(subscriptions.schoolId, made[0])),
    );
    expect(subs).toHaveLength(1);
    expect(await rawCount(owner, "subscriptions", made[0])).toBe(1);
  });

  it("signs people in against its own database", async () => {
    const id = made[0];
    const home = await homeOf(id);
    const [user] = await withTenant(id, (tx) => tx.select().from(users).where(eq(users.schoolId, id)));
    await home.insert(sessions).values({
      id: `test-${stamp}`,
      userId: user.id,
      schoolId: id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const [row] = await home.select().from(sessions).where(eq(sessions.id, `test-${stamp}`));
    expect(row.userId).toBe(user.id);
  });

  it("cannot be reached from another school, shared or separate", async () => {
    const alpha = made[0];
    const beta = await newOwnSchool("beta");
    const shared = await makeSchool();
    made.push(shared.school.id);

    for (const other of [beta.id, shared.school.id]) {
      const seen = await withTenant(other, (tx) =>
        tx.select().from(students).where(eq(students.studentNumber, "A-1")),
      );
      expect(seen.filter((s) => s.schoolId === alpha)).toHaveLength(0);
    }
    // Inside alpha's database, row-level security still holds: the app's login
    // with another school's id sees nothing.
    const app = postgres(withDatabaseName(process.env.APP_DATABASE_URL ?? owner, await homeName(alpha)), {
      max: 1,
      onnotice: () => {},
    });
    try {
      const rows = await app.begin(async (tx) => {
        await tx`select set_config('app.school_id', ${beta.id}, true)`;
        return tx`select id from students`;
      });
      expect(rows).toHaveLength(0);
    } finally {
      await app.end();
    }
  });

  it("is brought up to date by the same migration run, and running it again changes nothing", async () => {
    const name = await homeName(made[0]);
    await prepareDatabase(withDatabaseName(owner, name));
    expect(await rawCount(withDatabaseName(owner, name), "students", made[0])).toBe(1);
  });

  it("is the default for self-registration unless turned off", () => {
    expect(ownDatabaseByDefault({})).toBe(true);
    expect(ownDatabaseByDefault({ SCHOOL_DATABASES: "shared" })).toBe(false);
  });
});

async function homeName(schoolId: string) {
  const sql = postgres(owner, { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql`select database_name from schools where id = ${schoolId}`;
    return row.database_name as string;
  } finally {
    await sql.end();
  }
}
