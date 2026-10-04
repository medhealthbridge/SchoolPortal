import { Panel } from "@/components/ui";
import InviteForm from "./form";

export const metadata = { title: "Accept your invite" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="mx-auto w-full max-w-[26rem] px-5 py-14 sm:py-20">
      <h1 className="w-wide text-[1.75rem] font-bold leading-tight">Accept your invite</h1>
      <p className="mt-1.5 mb-7 max-w-[44ch] text-[var(--ink-soft)]">
        Choose a password and your account is ready.
      </p>
      <Panel>
        <InviteForm token={token} />
      </Panel>
    </div>
  );
}
