import { LinkButton, Panel } from "@/components/ui";
import { OfflineIcon } from "@/components/icons";

export const metadata = { title: "No signal" };

export default function Offline() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col justify-center px-[var(--gutter)] py-12">
      <Panel>
        <span
          aria-hidden
          className="mb-4 flex h-10 w-10 items-center justify-center rounded-control bg-subtle text-muted"
        >
          <OfflineIcon size={20} />
        </span>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">No signal</h1>
        <p className="mt-3 max-w-[52ch] text-muted">
          Attendance you have already taken is saved on this device and goes up by itself when
          the signal returns. Carry on taking the class.
        </p>
        <div className="mt-6">
          <LinkButton href="/attendance">Take attendance</LinkButton>
        </div>
      </Panel>
    </div>
  );
}
