/** The full address of a page at a school, for links that leave the app (email, SMS). */
export function schoolUrl(subdomain: string, path = "/") {
  const root = process.env.ROOT_DOMAIN ?? "lvh.me:3000";
  const protocol = root.includes("lvh.me") || root.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${subdomain}.${root}${path}`;
}
