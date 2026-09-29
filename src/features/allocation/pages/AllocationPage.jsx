import { useState } from "react";
import { allocationRows, dates } from "../data/mockAllocationData";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import Drawer from "../../../components/ui/Drawer";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";

export default function AllocationPage() {
  const [walkIn, setWalkIn] = useState(null);
  const [selected, setSelected] = useState(null);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Bed Allocation
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            7-day room and bed allocation tape chart.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <Legend type="checked_in" label="Checked in" />
          <Legend type="pending" label="Pending" />
          <Legend type="vacant" label="Vacant" />
          <Legend type="maintenance" label="Maintenance" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[210px_repeat(7,minmax(110px,1fr))] border-b border-slate-200">
              <div className="sticky left-0 z-20 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Room / Bed
              </div>

              {dates.map((date) => (
                <div
                  key={date.toISOString()}
                  className="border-l border-slate-100 px-3 py-3 text-center"
                >
                  <div className="text-xs text-slate-400">
                    {date.toLocaleDateString("en-IN", {
                      weekday: "short",
                    })}
                  </div>

                  <div className="font-semibold text-slate-800">
                    {date.getDate()}
                  </div>
                </div>
              ))}
            </div>

            {allocationRows.map((room) =>
              room.units.map((unit) => (
                <div
                  key={unit.id}
                  className="grid grid-cols-[210px_repeat(7,minmax(110px,1fr))] border-b border-slate-100"
                >
                  <div className="sticky left-0 z-10 bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-slate-800">
                      {unit.label}
                    </div>

                    <div className="text-xs text-slate-400">
                      {room.type}
                    </div>
                  </div>

                  {dates.map((date, index) => (
                    <AllocationSlot
                      key={index}
                      unit={unit}
                      date={date}
                      onVacant={() =>
                        unit.status === "vacant" &&
                        setWalkIn({
                          unit,
                          date,
                        })
                      }
                      onSelect={() =>
                        unit.status !== "vacant" &&
                        unit.status !== "maintenance" &&
                        setSelected(unit)
                      }
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(walkIn)}
        onClose={() => setWalkIn(null)}
        title="Walk-in / New reservation"
      >
        <div className="space-y-4">
          <Input label="Guest name" placeholder="Full name" />

          <Input
            label="Phone"
            placeholder="+91 98765 43210"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Check-in" type="date" />
            <Input label="Check-out" type="date" />
          </div>

          <Input
            label="Nationality"
            placeholder="India"
          />

          <Button className="w-full">
            Create reservation
          </Button>
        </div>
      </Modal>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Reservation details"
      >
        {selected && (
          <div className="space-y-5">
            <div>
              <div className="text-lg font-semibold text-slate-900">
                {selected.guest}
              </div>

              <div className="mt-1 text-sm text-slate-500">
                {selected.nationality}
              </div>
            </div>

            <Badge status={selected.status} />

            <Info
              label="Unit"
              value={selected.label}
            />

            <Info
              label="Phone"
              value={selected.phone}
            />

            <Info
              label="Check-in"
              value={selected.checkIn}
            />

            <Info
              label="Check-out"
              value={selected.checkOut}
            />

            <Info
              label="ID uploaded"
              value={selected.idUploaded ? "Yes" : "No"}
            />

            <div className="flex gap-2">
              <Button>
                Check out
              </Button>

              <Button variant="secondary">
                Change bed
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function AllocationSlot({
  unit,
  onVacant,
  onSelect,
}) {
  const styles = {
    checked_in:
      "border-emerald-300 bg-emerald-100 hover:bg-emerald-200",

    pending:
      "border-amber-400 border-dashed bg-amber-50 hover:bg-amber-100",

    vacant:
      "border-slate-200 bg-white hover:bg-slate-50",

    maintenance:
      "border-slate-300 bg-slate-100",
  };

  return (
    <button
      type="button"
      disabled={unit.status === "maintenance"}
      onClick={
        unit.status === "vacant"
          ? onVacant
          : onSelect
      }
      className={`m-1 min-h-16 rounded-lg border p-2 text-left transition ${
        styles[unit.status]
      }`}
    >
      <div className="text-xs font-semibold capitalize text-slate-700">
        {unit.status.replace("_", " ")}
      </div>

      {unit.guest && (
        <div className="mt-1 truncate text-[11px] text-slate-600">
          {unit.guest}
        </div>
      )}
    </button>
  );
}

function Legend({ type, label }) {
  const styles = {
    checked_in: "bg-emerald-400",
    pending: "border border-amber-400 border-dashed bg-amber-50",
    vacant: "border border-slate-200 bg-white",
    maintenance: "bg-slate-300",
  };

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-3 w-3 rounded-sm ${styles[type]}`}
      />

      {label}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-3 text-sm">
      <span className="text-slate-400">
        {label}
      </span>

      <span className="text-right font-medium text-slate-700">
        {value}
      </span>
    </div>
  );
}