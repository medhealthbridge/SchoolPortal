import { requirePermission } from "@/lib/guard";
import { CommunityPage } from "@/modules/community/view";

export const metadata = { title: "Chaplain" };

export default async function ChaplainPage() {
  const { school } = await requirePermission("chaplain.manage");
  return (
    <CommunityPage
      schoolId={school.id}
      kind="ministry"
      title="Ministry"
      blurb="Formation activities and the service hours they earn"
      withClubs={false}
    />
  );
}
