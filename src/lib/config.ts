/**
 * What has to be true before this serves a real school.
 *
 * Each check here is a mistake that is silent in production — nothing crashes,
 * nothing logs, the app simply stops protecting someone. The worst of them is
 * the first: with no APP_DATABASE_URL the app connects as the table owner,
 * row-level security is bypassed for every query, and one school can read
 * another's students. Everything still works, which is exactly the problem.
 */
export type ConfigProblem = { key: string; says: string };

const DEFAULTS = [
  "change-me-in-production-at-least-32-chars",
  "admin12345",
  "schoolportal",
];

export function configProblems(env: NodeJS.ProcessEnv = process.env): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const has = (k: string) => (env[k] ?? "").trim().length > 0;

  if (!has("APP_DATABASE_URL")) {
    problems.push({
      key: "APP_DATABASE_URL",
      says:
        "not set, so the app would connect as the database owner and row-level " +
        "security would be bypassed. Run npm run db:migrate, then point this at app_user.",
    });
  } else if (env.APP_DATABASE_URL === env.DATABASE_URL) {
    problems.push({
      key: "APP_DATABASE_URL",
      says:
        "is the same as DATABASE_URL. The owner connection bypasses row-level " +
        "security; app_user is the one that must not.",
    });
  }

  if (!has("DATABASE_URL")) {
    problems.push({ key: "DATABASE_URL", says: "not set; migrations have nothing to connect to." });
  }

  if (!has("ROOT_DOMAIN")) {
    problems.push({
      key: "ROOT_DOMAIN",
      says: "not set, so every school's links would point at lvh.me:3000.",
    });
  }

  const adminPassword = env.PLATFORM_ADMIN_PASSWORD ?? "";
  // One complaint per setting: a reader fixing it does not need two.
  if (adminPassword && DEFAULTS.includes(adminPassword)) {
    problems.push({
      key: "PLATFORM_ADMIN_PASSWORD",
      says: "is still the example password, and that account reaches every school.",
    });
  } else if (adminPassword && adminPassword.length < 12) {
    problems.push({
      key: "PLATFORM_ADMIN_PASSWORD",
      says: "is shorter than 12 characters, and that account reaches every school.",
    });
  }

  // The local storage driver writes to the machine's own disk. That is right
  // for one box with a persistent volume and wrong everywhere else: on a
  // serverless host the write fails, and behind two instances half the
  // requests 404. Escapable, because a single VPS is a real way to run this.
  const s3 = (env.S3_BUCKET ?? "") && (env.S3_ACCESS_KEY_ID ?? "");
  if (!s3 && env.ALLOW_LOCAL_UPLOADS !== "yes") {
    problems.push({
      key: "S3_BUCKET",
      says:
        "not set, so uploaded logos go to this machine's disk — lost on a " +
        "serverless host and missing from half the requests behind two " +
        "instances. Set the S3_* variables, or ALLOW_LOCAL_UPLOADS=yes if " +
        "this is one box with a persistent volume.",
    });
  }

  for (const key of ["EMAIL_API_KEY", "SMS_API_KEY"] as const) {
    const url = key === "EMAIL_API_KEY" ? "EMAIL_API_URL" : "SMS_API_URL";
    if (has(key) && !has(url)) {
      problems.push({ key, says: `is set but ${url} is not, so nothing would be sent.` });
    }
  }

  return problems;
}

/**
 * Called once from instrumentation.ts. In production a bad config stops the
 * process; in development it prints, because a half-configured machine is the
 * normal state of one and refusing to boot would be tiresome.
 */
export function assertConfig(env: NodeJS.ProcessEnv = process.env) {
  const problems = configProblems(env);
  if (problems.length === 0) return;

  const lines = problems.map((p) => `  ${p.key} ${p.says}`).join("\n");
  if (env.NODE_ENV === "production") {
    throw new Error(`Refusing to start. The configuration is unsafe:\n${lines}`);
  }
  console.warn(`Configuration warnings (fatal in production):\n${lines}`);
}
