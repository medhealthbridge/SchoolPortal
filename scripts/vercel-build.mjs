/**
 * What Vercel runs instead of `npm run build`.
 *
 * On a Production deploy it brings the database up to date first — migrations,
 * the app role, row-level security, and the platform admin if there is none —
 * then builds. Every step is safe to repeat, so a redeploy changes nothing it
 * has already done.
 *
 * On anything else (a branch preview) it only builds. A preview must never
 * touch the production database: the variables that point at it are scoped to
 * Production, and this refuses to run the database steps without being told
 * it is one.
 */
import { spawnSync } from "node:child_process";

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    console.error(`\n✗ ${command} ${args.join(" ")} failed (${result.status}). Stopping the deploy.`);
    process.exit(result.status ?? 1);
  }
}

if (process.env.VERCEL_ENV === "production") {
  console.log("Production deploy: preparing the database.");
  run("npm", ["run", "db:migrate"]);
  run("npm", ["run", "db:bootstrap"]);
} else {
  console.log(`VERCEL_ENV=${process.env.VERCEL_ENV ?? "(unset)"}: building only, the database is not touched.`);
}

run("npx", ["next", "build"]);
