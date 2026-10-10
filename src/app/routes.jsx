import React, {lazy,Suspense} from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/Applayout';
const DashboardPage = lazy(() => import('../features/allocation/pages/DashboardPage'));
const AllocationPage = lazy(() => import('../features/allocation/pages/AllocationPage'));
const RoomsPage = lazy(() => import('../features/rooms/pages/RoomsPage'));
const HousekeepingPage = lazy(() => import('../features/rooms/pages/HousekeepingPage'));
const ReservationsPage = lazy(() => import('../features/reservations/pages/ReservationsPage'));
const GuestCheckinPage = lazy(() => import('../features/rooms/pages/GuestCheckinPage'));

import StaffGate from '../components/auth/StaffGate';
const GuestsPage = lazy(() => import('../features/rooms/pages/GuestsPage'));

const ReportsPage = lazy(() => import('../features/management/pages/ReportsPage'));
const PricingPage = lazy(() => import('../features/management/pages/PricingPage'));
const SettingsPage = lazy(() => import('../features/rooms/pages/SettingsPage'));

export function AppRoutes() {
  return (
    <Suspense fallback={<div role="status" className="p-8 text-sm text-slate-500">Loading Stayman…</div>}><Routes>
      <Route path="/guest-check-in" element={<GuestCheckinPage />} />
      <Route element={<StaffGate><AppLayout /></StaffGate>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/allocation" element={<AllocationPage />} />
        <Route path="/reservations" element={<ReservationsPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/guests" element={<GuestsPage />} />
        <Route path="/housekeeping" element={<HousekeepingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes></Suspense>
  );
}
