import React, { useState } from 'react';
import { X, Calendar } from 'lucide-react';

export default function NewReservationModal({ isOpen, onClose, onSubmit }) {
  const [bookingType, setBookingType] = useState('Individual'); // 'Individual' | 'Group'
  const [formData, setFormData] = useState({
    guestName: '',
    checkInDate: '2025-10-01',
    checkOutDate: '2025-10-03',
    roomBed: '',
    numberOfGuests: '1',
    source: 'Direct Booking',
    notes: '',
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSubmit) {
      onSubmit({ ...formData, bookingType });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-xl font-bold text-gray-900">New Reservation</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Toggle: Individual / Group */}
        <div className="my-4 flex border-b border-gray-100 bg-gray-50/50 p-1">
          <button
            type="button"
            onClick={() => setBookingType('Individual')}
            className={`flex-1 py-2 text-sm font-semibold transition-all ${
              bookingType === 'Individual'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Individual
          </button>
          <button
            type="button"
            onClick={() => setBookingType('Group')}
            className={`flex-1 py-2 text-sm font-semibold transition-all ${
              bookingType === 'Group'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Group
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {/* Guest Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700">Guest Name</label>
            <input
              type="text"
              name="guestName"
              placeholder="Search or create guest"
              value={formData.guestName}
              onChange={handleChange}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              required
            />
          </div>

          {/* Dates Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700">Check-in Date</label>
              <div className="relative mt-1">
                <input
                  type="date"
                  name="checkInDate"
                  value={formData.checkInDate}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700">Check-out Date</label>
              <div className="relative mt-1">
                <input
                  type="date"
                  name="checkOutDate"
                  value={formData.checkOutDate}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>
          </div>

          {/* Room / Guests Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700">Room/Bed</label>
              <select
                name="roomBed"
                value={formData.roomBed}
                onChange={handleChange}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              >
                <option value="">Select room or bed</option>
                <option value="Dorm Bed 1">Dorm Bed 1</option>
                <option value="Dorm Bed 2">Dorm Bed 2</option>
                <option value="Private Deluxe">Private Deluxe</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700">Number of Guests</label>
              <select
                name="numberOfGuests"
                value={formData.numberOfGuests}
                onChange={handleChange}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              >
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <option key={num} value={num}>{num}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Source */}
          <div>
            <label className="block text-xs font-semibold text-gray-700">Source</label>
            <select
              name="source"
              value={formData.source}
              onChange={handleChange}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            >
              <option value="Direct Booking">Direct Booking</option>
              <option value="Booking.com">Booking.com</option>
              <option value="Airbnb">Airbnb</option>
              <option value="Hostelworld">Hostelworld</option>
              <option value="Walk-in">Walk-in</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700">Notes (optional)</label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Add any special requests..."
              value={formData.notes}
              onChange={handleChange}
              className="mt-1 w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
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
  );
}