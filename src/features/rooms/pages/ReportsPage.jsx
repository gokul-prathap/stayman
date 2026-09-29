const cards = [
  ["Occupancy", "72%"],
  ["Revenue this month", "₹2,84,500"],
  ["Average daily rate", "₹2,145"],
  ["Total nights", "384"],
];

const revenue = [
  45, 65, 52, 78, 68, 90,
  82, 100, 76, 88, 95, 84,
];

export default function ReportsPage() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">
          Reports
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Property performance overview.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="text-sm text-slate-500">
              {label}
            </div>

            <div className="mt-2 text-2xl font-bold text-slate-900">
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">
          Revenue trend
        </h2>

        <div className="mt-6 flex h-48 items-end gap-2">
          {revenue.map((height, index) => (
            <div
              key={index}
              className="flex-1 rounded-t bg-slate-800"
              style={{
                height: `${height}%`,
              }}
            />
          ))}
        </div>

        <div className="mt-3 flex justify-between text-xs text-slate-400">
          <span>Week 1</span>
          <span>Week 2</span>
          <span>Week 3</span>
          <span>Week 4</span>
        </div>
      </div>
    </div>
  );
}