import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/Applayout';
import DashboardPage from '../features/allocation/pages/DashboardPage';
import AllocationPage from '../features/allocation/pages/AllocationPage';
import RoomsPage from '../features/rooms/pages/RoomsPage';
import HousekeepingPage from '../features/rooms/pages/HousekeepingPage';
import ReservationsPage from '../features/reservations/pages/ReservationsPage';
import GuestCheckinPage from '../features/rooms/pages/GuestCheckinPage';

// Standard fallback placeholders for routes undergoing backend wiring
const Placeholder = ({ title }) => (
  <div className="p-8 text-center text-slate-500">
    <h2 className="text-xl font-bold text-slate-800 mb-2">{title}</h2>
    <p className="text-sm">Module interface connected and ready for API sync.</p>
  </div>
);

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/guest-check-in" element={<GuestCheckinPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/allocation" element={<AllocationPage />} />
        <Route path="/reservations" element={<ReservationsPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/guests" element={<Placeholder title="Guest Profiles" />} />
        <Route path="/housekeeping" element={<HousekeepingPage />} />
        <Route path="/reports" element={<Placeholder title="Operational Reports" />} />
        <Route path="/settings" element={<Placeholder title="Property Settings" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
