export const metadata = { title: "No signal" };

export default function Offline() {
  return (
    <div className="mx-auto w-full max-w-[30rem] px-5 py-16 sm:py-24">
      <h1 className="w-wide text-[1.75rem] font-bold leading-tight">No signal</h1>
      <p className="mt-3 max-w-[52ch] text-[var(--ink-soft)]">
        Attendance you have already taken is saved on this phone and goes up by
        itself when the signal returns. Carry on taking the class.
      </p>
      <a
        className="mt-6 inline-block rounded-[2px] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white"
        href="/attendance"
      >
        Take attendance
      </a>
    </div>
  );
}
