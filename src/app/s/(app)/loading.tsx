export default function Loading() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="h-7 w-48 rounded bg-line" />
      <div className="h-4 w-64 rounded bg-line" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-line" />
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 rounded bg-line" />
        ))}
      </div>
    </div>
  );
}
