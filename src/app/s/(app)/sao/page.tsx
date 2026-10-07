import { requirePermission } from "@/lib/guard";
import { ExportPanel } from "@/components/export-panel";
import { CommunityPage } from "@/modules/community/view";

export const metadata = { title: "SAO" };

export default async function SaoPage() {
  const { school, session } = await requirePermission("sao.manage");
  return (
    <>
    <CommunityPage
      schoolId={school.id}
      kind="sao_event"
      title="Student affairs"
      blurb="Clubs, events and the service hours they earn"
      withClubs
    />
      <ExportPanel dataset="club-members" roles={session.roles} />
    </>
  );
}
