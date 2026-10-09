import { useState } from "react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import Input from "../../../components/ui/Input";
import { ArrowLeft, X, User } from "lucide-react";

const initialReservations = [
  {
    id: "ST12345",
    guest: "Arjun Menon",
    phone: "+91 98765 43210",
    nationality: "India",
    unit: "Room 101 (Private Deluxe King)",
    checkIn: "2025-09-30",
    checkInTime: "Sep 30, 2025 (2:00 PM)",
    checkOut: "2025-10-02",
    checkOutTime: "Oct 2, 2025 (11:00 AM)",
    status: "Confirmed",
    guestsCount: "2 Adults",
    source: "Direct Booking",
    totalAmount: 8000,
    paid: 5000,
    balance: 3000,
    notes: "",
  },
  {
    id: "RES-1002",
    guest: "Maya Thomas",
    phone: "+91 98765 11223",
    nationality: "India",
    unit: "Dorm 201-B",
    checkIn: "2025-09-28",
    checkInTime: "Sep 28, 2025 (2:00 PM)",
    checkOut: "2025-10-03",
    checkOutTime: "Oct 03, 2025 (11:00 AM)",
    status: "Confirmed",
    guestsCount: "1 Adult",
    source: "Booking.com",
    totalAmount: 4500,
    paid: 4500,
    balance: 0,
    notes: "Late check-in requested",
  },
  {
    id: "RES-1003",
    guest: "Daniel Wong",
    phone: "+65 9123 4567",
    nationality: "Singapore",
    unit: "Dorm 201-C",
    checkIn: "2025-09-29",
    checkInTime: "Sep 29, 2025 (2:00 PM)",
    checkOut: "2025-10-01",
    checkOutTime: "Oct 01, 2025 (11:00 AM)",
    status: "Pending",
    guestsCount: "1 Adult",
    source: "Airbnb",
    totalAmount: 2200,
    paid: 0,
    balance: 2200,
    notes: "",
  },
];

export default function ReservationsPage() {
  const [reservationsList, setReservationsList] = useState(initialReservations);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);

  // New Reservation Form State
  const [bookingType, setBookingType] = useState("Individual");
  const [formData, setFormData] = useState({
    guestName: "",
    checkInDate: "2025-10-01",
    checkOutDate: "2025-10-03",
    roomBed: "",
    numberOfGuests: "1",
    source: "Direct Booking",
    notes: "",
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateReservation = (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      bookingType,
      id: `ST${Math.floor(10000 + Math.random() * 90000)}`,
      status: "Confirmed",
      totalAmount: 5000,
      paid: 0,
      balance: 5000,
    };

    console.log("New Reservation Created:", payload);

    setReservationsList((prev) => [
      {
        id: payload.id,
        guest: payload.guestName || "Guest",
        phone: "+91 00000 00000",
        nationality: "India",
        unit: payload.roomBed || "Standard Room",
        checkIn: payload.checkInDate,
        checkInTime: `${payload.checkInDate} (2:00 PM)`,
        checkOut: payload.checkOutDate,
        checkOutTime: `${payload.checkOutDate} (11:00 AM)`,
        status: payload.status,
        guestsCount: `${payload.numberOfGuests} Guest(s)`,
        source: payload.source,
        totalAmount: payload.totalAmount,
        paid: payload.paid,
        balance: payload.balance,
        notes: payload.notes,
      },
      ...prev,
    ]);

    setIsCreateOpen(false);
    setFormData({
      guestName: "",
      checkInDate: "2025-10-01",
      checkOutDate: "2025-10-03",
      roomBed: "",
      numberOfGuests: "1",
      source: "Direct Booking",
      notes: "",
    });
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reservations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage guest bookings and stays.
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)}>
          + New reservation
        </Button>
      </div>

      {/* Table */}
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
              {reservationsList.map((res) => (
                <tr
                  key={res.id}
                  onClick={() => setSelectedReservation(res)}
                  className="cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <td className="px-5 py-4 font-medium text-blue-600 hover:underline">
                    {res.id}
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-800">
                    {res.guest}
                  </td>
                  <td className="px-5 py-4 text-slate-600">{res.unit}</td>
                  <td className="px-5 py-4 text-slate-600">{res.checkIn}</td>
                  <td className="px-5 py-4 text-slate-600">{res.checkOut}</td>
                  <td className="px-5 py-4">
                    <Badge status={res.status.toLowerCase()} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Create Reservation */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-xl font-bold text-slate-900">New Reservation</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Individual / Group Tab Toggle */}
            <div className="my-4 flex border-b border-slate-100">
              <button
                type="button"
                onClick={() => setBookingType("Individual")}
                className={`flex-1 pb-2.5 text-sm font-semibold transition-all ${
                  bookingType === "Individual"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Individual
              </button>
              <button
                type="button"
                onClick={() => setBookingType("Group")}
                className={`flex-1 pb-2.5 text-sm font-semibold transition-all ${
                  bookingType === "Group"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Group
              </button>
            </div>

            <form onSubmit={handleCreateReservation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Guest Name</label>
                <input
                  type="text"
                  name="guestName"
                  placeholder="Search or create guest"
                  value={formData.guestName}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Check-in Date</label>
                  <input
                    type="date"
                    name="checkInDate"
                    value={formData.checkInDate}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Check-out Date</label>
                  <input
                    type="date"
                    name="checkOutDate"
                    value={formData.checkOutDate}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Room/Bed</label>
                  <select
                    name="roomBed"
                    value={formData.roomBed}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  >
                    <option value="">Select room or bed</option>
                    <option value="Room 101 (Private Deluxe King)">Room 101 (Private Deluxe King)</option>
                    <option value="Dorm 201-B">Dorm 201-B</option>
                    <option value="Dorm 201-C">Dorm 201-C</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Number of Guests</label>
                  <select
                    name="numberOfGuests"
                    value={formData.numberOfGuests}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  >
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <option key={num} value={num}>{num}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Source</label>
                <select
                  name="source"
                  value={formData.source}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                >
                  <option value="Direct Booking">Direct Booking</option>
                  <option value="Booking.com">Booking.com</option>
                  <option value="Airbnb">Airbnb</option>
                  <option value="Hostelworld">Hostelworld</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (optional)</label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Add any special requests..."
                  value={formData.notes}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 active:scale-[0.98]"
                >
                  Create Reservation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Reservation Details View */}
      {selectedReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            {/* Top Bar */}
            <div className="flex items-center justify-between pb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedReservation(null)}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                >
                  <ArrowLeft size={18} />
                </button>
                <h2 className="text-lg font-bold text-slate-900">
                  Reservation #{selectedReservation.id}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-600">
                  {selectedReservation.status}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedReservation(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Guest Summary Card */}
            <div className="my-2 flex items-center gap-3 rounded-xl bg-slate-50/70 p-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <User size={22} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 leading-tight">
                  {selectedReservation.guest}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedReservation.phone} • {selectedReservation.nationality}
                </p>
              </div>
            </div>

            {/* Details Fields */}
            <div className="space-y-4 py-3 text-sm">
              <div>
                <div className="text-xs font-medium text-slate-400">Check-in</div>
                <div className="font-semibold text-slate-800">
                  {selectedReservation.checkInTime}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-400">Check-out</div>
                <div className="font-semibold text-slate-800">
                  {selectedReservation.checkOutTime}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-400">Room/Bed</div>
                <div className="font-semibold text-slate-800">
                  {selectedReservation.unit}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-400">Guests</div>
                <div className="font-semibold text-slate-800">
                  {selectedReservation.guestsCount}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-400">Total Amount</div>
                <div className="text-lg font-bold text-slate-900">
                  ₹ {selectedReservation.totalAmount?.toLocaleString()}
                </div>
              </div>

              {/* Payment Summary Box */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="text-xs font-bold text-slate-600 mb-2">
                  Payment Summary
                </div>
                <div className="flex justify-between text-xs py-1 text-slate-500">
                  <span>Paid</span>
                  <span className="font-semibold text-slate-800">
                    ₹ {selectedReservation.paid?.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-rose-500 font-medium">Balance</span>
                  <span className="font-bold text-rose-500">
                    ₹ {selectedReservation.balance?.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-3 pt-3">
              <button
                type="button"
                onClick={() => console.log("Edit Reservation:", selectedReservation)}
                className="rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => console.log("Cancel Reservation:", selectedReservation)}
                className="rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => console.log("Check-in Guest:", selectedReservation)}
                className="rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700"
              >
                Check-in
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}