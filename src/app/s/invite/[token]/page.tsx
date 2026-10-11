import { Panel } from "@/components/ui";
import InviteForm from "./form";

export const metadata = { title: "Accept your invite" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-[var(--gutter)] py-12">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Accept your invite</h1>
      <p className="mb-6 mt-1 max-w-[44ch] text-muted">
        Choose a password and your account is ready.
      </p>
      <Panel>
        <InviteForm token={token} />
      </Panel>
    </div>
  );
}
