import { ArrowRight, BedDouble, CalendarCheck, CreditCard, LogIn } from "lucide-react";
import { Link } from "react-router-dom";
import { allocationRows } from "../../allocation/data/mockAllocationData";
import Badge from "../../../components/ui/Badge";

export default function DashboardPage() {
  const units = allocationRows.flatMap(
    (room) => room.units
  );

  const occupied = units.filter(
    (unit) => unit.status === "checked_in"
  ).length;

  const pending = units.filter(
    (unit) => unit.status === "pending"
  ).length;

  const available = units.filter(
    (unit) => unit.status === "vacant"
  ).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Good morning
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Here is what is happening at your property today.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={BedDouble}
          label="Occupied"
          value={occupied}
          hint="Currently checked in"
        />

        <StatCard
          icon={BedDouble}
          label="Available"
          value={available}
          hint="Ready for allocation"
        />

        <StatCard
          icon={CalendarCheck}
          label="Pending"
          value={pending}
          hint="Expected check-ins"
        />

        <StatCard
          icon={CreditCard}
          label="Outstanding"
          value="₹8,450"
          hint="Guest balances"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                Today's activity
              </h2>

              <p className="text-xs text-slate-400">
                Latest reservations and arrivals
              </p>
            </div>

            <Link
              to="/reservations"
              className="flex items-center gap-1 text-sm font-medium text-slate-700"
            >
              View all
              <ArrowRight size={15} />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            <Activity
              name="Arjun Menon"
              unit="Room 101"
              status="checked_in"
            />

            <Activity
              name="Maya Thomas"
              unit="Dorm 201-B"
              status="pending"
            />

            <Activity
              name="Daniel Wong"
              unit="Dorm 201-C"
              status="vacant"
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">
            Quick actions
          </h2>

          <div className="mt-4 space-y-2">
            <QuickAction
              to="/allocation"
              text="Open bed allocation"
            />

            <QuickAction
              to="/reservations"
              text="Create reservation"
            />

            <QuickAction
              to="/check-in"
              text="Walk-in check-in"
            />

            <QuickAction
              to="/rooms"
              text="Manage rooms & beds"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <Icon
        size={19}
        className="text-slate-500"
      />

      <div className="mt-3 text-2xl font-bold text-slate-900">
        {value}
      </div>

      <div className="text-sm font-medium text-slate-700">
        {label}
      </div>

      <div className="mt-1 text-xs text-slate-400">
        {hint}
      </div>
    </div>
  );
}

function Activity({
  name,
  unit,
  status,
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div>
        <div className="text-sm font-medium text-slate-800">
          {name}
        </div>

        <div className="text-xs text-slate-400">
          {unit}
        </div>
      </div>

      <Badge status={status} />
    </div>
  );
}

function QuickAction({
  to,
  text,
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      {text}
      <ArrowRight size={16} />
    </Link>
  );
}