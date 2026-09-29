import { BedDouble, DoorOpen } from "lucide-react";
import Badge from "../../../components/ui/Badge";
import { allocationRows } from "../../allocation/data/mockAllocationData";

export default function RoomsPage() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">
          Rooms & Beds
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Manage property inventory and operational status.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {allocationRows.map((room) => (
          <div
            key={room.roomId}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <DoorOpen size={18} />
                  {room.roomName}
                </div>

                <div className="mt-1 text-xs text-slate-400">
                  {room.type}
                </div>
              </div>

              <Badge status="confirmed">
                Active
              </Badge>
            </div>

            <div className="mt-5 space-y-2">
              {room.units.map((unit) => (
                <div
                  key={unit.id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <BedDouble size={15} />
                    {unit.label}
                  </div>

                  <Badge status={unit.status} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}