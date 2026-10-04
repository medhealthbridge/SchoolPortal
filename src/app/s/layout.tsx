import { notFound } from "next/navigation";
import { currentSchool } from "@/lib/session";

/**
 * Everything under a school's subdomain. The school is resolved here so the
 * page can wear its colours; access control happens in (app)/layout.tsx and,
 * independently, in every action and API route.
 */
export default async function SchoolShell({ children }: { children: React.ReactNode }) {
  const school = await currentSchool();
  if (!school) notFound();
  return (
    <div
      className="min-h-full"
      style={
        {
          "--brand": school.primaryColor,
          "--accent": school.accentColor,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
