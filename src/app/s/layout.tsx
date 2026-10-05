import { notFound } from "next/navigation";
import { currentSchool } from "@/lib/session";
import { brandStyle } from "@/lib/brand";

/**
 * Everything under a school's subdomain. The school is resolved here so its
 * own colour reaches the brand badge; access control happens in
 * (app)/layout.tsx and, independently, in every action and API route.
 */
export default async function SchoolShell({ children }: { children: React.ReactNode }) {
  const school = await currentSchool();
  if (!school) notFound();
  return (
    <div className="min-h-full" style={brandStyle(school.primaryColor)}>
      {children}
    </div>
  );
}
