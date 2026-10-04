export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <div className="mx-auto max-w-md px-5 py-20 text-center">
      <h1 className="text-xl font-semibold">No signal</h1>
      <p className="mt-2 text-sm text-black/65 dark:text-white/65">
        Attendance you have already taken is saved on this phone and uploads by
        itself when the signal returns. Open “Take attendance” to carry on.
      </p>
      <a className="brand-text mt-5 inline-block text-sm font-medium underline" href="/attendance">
        Take attendance
      </a>
    </div>
  );
}
