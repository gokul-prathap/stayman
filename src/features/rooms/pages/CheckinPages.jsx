import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";

const arrivals = [
  ["Arjun Menon", "Room 101", "10:30", "checked_in"],
  ["Maya Thomas", "Dorm 201-B", "14:00", "pending"],
  ["Ravi Kumar", "Room 102", "15:30", "pending"],
];

export default function CheckinPage() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">
          Check-in / Check-out
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Today's arrivals and departures.
        </p>
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {arrivals.map((arrival) => (
          <div
            key={arrival[0]}
            className="flex flex-wrap items-center justify-between gap-3 p-5"
          >
            <div>
              <div className="font-semibold text-slate-800">
                {arrival[0]}
              </div>

              <div className="text-sm text-slate-400">
                {arrival[1]} • {arrival[2]}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge status={arrival[3]} />

              {arrival[3] === "pending" ? (
                <Button>
                  Check in
                </Button>
              ) : (
                <Button variant="secondary">
                  Check out
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}