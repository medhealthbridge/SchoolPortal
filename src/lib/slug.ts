/**
 * An address a school could use, made from the name it typed: "St. Mary's
 * Academy" → "st-marys-academy". Only a suggestion; the person can change it,
 * and the live availability check still decides.
 */
export function suggestSubdomain(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (words.length <= 40) return words;
  // Cut at a word boundary where there is one, so it never ends mid-word.
  const cut = words.slice(0, 40);
  const at = cut.lastIndexOf("-");
  return (at >= 12 ? cut.slice(0, at) : cut).replace(/-+$/, "");
}

/** The address a role would have at a school: teacher@st-marys.example.com. */
export function roleAddress(role: string, subdomain: string, root: string): string {
  const local = role.replace(/_/g, "-");
  return `${local}@${subdomain}.${root.split(":")[0]}`;
}
