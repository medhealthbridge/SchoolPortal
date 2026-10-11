/**
 * Where an action wants the browser to go next.
 *
 * Server actions do not `redirect()` across these trees. Every page is served
 * through the subdomain rewrite (`/` → `/s`, `/admin`, `/site`), and the App
 * Router resolves a redirect from inside a rewritten route against the
 * rewritten path, which lands on the wrong tree. Actions return this instead
 * and the form does a real navigation, which goes through middleware again.
 */
export type Navigation = { goTo: string };

export function goTo(path: string): Navigation {
  return { goTo: path };
}
