/**
 * What a school may say about itself in Setup: its name, where it is, how to
 * reach it, and the one colour it is known by.
 *
 * Parsed here rather than inside the server action so the rules can be tested
 * without a database, and so the messages — which are the interface's voice —
 * live next to the rules they explain.
 */
export const PROFILE_LIMITS = { name: 120, address: 240, phone: 30 } as const;

export type Profile = {
  name: string;
  address: string | null;
  phone: string | null;
  /** Always `#RRGGBB`, upper-case, so two spellings of one colour compare equal. */
  primaryColor: string;
};

export type ProfileResult = { ok: true; value: Profile } | { ok: false; error: string };

/** Stray runs of spaces, tabs and line breaks become one space. */
const tidy = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

export function parseProfile(input: {
  name?: unknown;
  address?: unknown;
  phone?: unknown;
  primaryColor?: unknown;
}): ProfileResult {
  const name = tidy(input.name);
  if (!name) return { ok: false, error: "A school needs a name." };
  if (name.length > PROFILE_LIMITS.name) {
    return { ok: false, error: `Keep the name under ${PROFILE_LIMITS.name} characters.` };
  }

  const address = tidy(input.address);
  if (address.length > PROFILE_LIMITS.address) {
    return { ok: false, error: `Keep the address under ${PROFILE_LIMITS.address} characters.` };
  }

  // Philippine numbers arrive as "+63 917 000 0001", "0917-000-0001" and
  // "(02) 8123 4567". Accept the punctuation people actually type, and ask for
  // enough digits that a stray "1" is not saved as a phone number.
  const phone = tidy(input.phone);
  if (phone) {
    const digits = phone.replace(/\D/g, "").length;
    if (!/^[0-9+().\-\s]+$/.test(phone) || digits < 6 || digits > 15) {
      return {
        ok: false,
        error: "Enter the phone number with digits only, like +63 2 8123 4567 or (02) 8123 4567.",
      };
    }
    if (phone.length > PROFILE_LIMITS.phone) {
      return { ok: false, error: `Keep the phone number under ${PROFILE_LIMITS.phone} characters.` };
    }
  }

  const color = String(input.primaryColor ?? "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    return { ok: false, error: "Pick the brand colour from the colour box." };
  }

  return {
    ok: true,
    value: {
      name,
      address: address || null,
      phone: phone || null,
      primaryColor: color.toUpperCase(),
    },
  };
}
