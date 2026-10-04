import { Card } from "@/components/ui";
import InviteForm from "./form";

export const metadata = { title: "Accept your invite" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="mb-4 text-2xl font-semibold">Accept your invite</h1>
      <Card>
        <InviteForm token={token} />
      </Card>
    </div>
  );
}
