import { useState } from "react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import Input from "../../../components/ui/Input";

const reservations = [
  {
    id: "RES-1001",
    guest: "Arjun Menon",
    unit: "Room 101",
    checkIn: "Sep 28",
    checkOut: "Oct 02",
    status: "confirmed",
  },
  {
    id: "RES-1002",
    guest: "Maya Thomas",
    unit: "Dorm 201-B",
    checkIn: "Sep 28",
    checkOut: "Oct 03",
    status: "confirmed",
  },
  {
    id: "RES-1003",
    guest: "Daniel Wong",
    unit: "Dorm 201-C",
    checkIn: "Sep 29",
    checkOut: "Oct 01",
    status: "pending",
  },
];

export default function ReservationsPage() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Reservations
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Manage guest bookings and stays.
          </p>
        </div>

        <Button onClick={() => setOpen(true)}>
          + New reservation
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-5 py-3">Reservation</th>
                <th className="px-5 py-3">Guest</th>
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3">Check-in</th>
                <th className="px-5 py-3">Check-out</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {reservations.map((reservation) => (
                <tr
                  key={reservation.id}
                  className="hover:bg-slate-50"
                >
                  <td className="px-5 py-4 font-medium">
                    {reservation.id}
                  </td>

                  <td className="px-5 py-4">
                    {reservation.guest}
                  </td>

                  <td className="px-5 py-4">
                    {reservation.unit}
                  </td>

                  <td className="px-5 py-4">
                    {reservation.checkIn}
                  </td>

                  <td className="px-5 py-4">
                    {reservation.checkOut}
                  </td>

                  <td className="px-5 py-4">
                    <Badge status={reservation.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New reservation"
      >
        <div className="space-y-4">
          <Input
            label="Guest name"
            placeholder="Full name"
          />

          <Input
            label="Phone"
            placeholder="+91 98765 43210"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Check-in"
              type="date"
            />

            <Input
              label="Check-out"
              type="date"
            />
          </div>

          <Input
            label="Nationality"
            placeholder="India"
          />

          <Button className="w-full">
            Save reservation
          </Button>
        </div>
      </Modal>
    </div>
  );
}