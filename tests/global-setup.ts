import "../src/db/load-env";

export default function setup() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Tests need DATABASE_URL (see .env.example).");
  }
}
