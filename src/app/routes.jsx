import AppLoader from '../components/ui/AppLoader';
import React, {lazy,Suspense} from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/Applayout';
const DashboardPage = lazy(() => import('../features/allocation/pages/DashboardPage'));
const StayViewPage = lazy(() => import('../features/allocation/pages/StayViewPage'));
const RoomsPage = lazy(() => import('../features/rooms/pages/RoomsPage'));
const HousekeepingPage = lazy(() => import('../features/rooms/pages/HousekeepingPage'));
const ReservationsPage = lazy(() => import('../features/reservations/pages/ReservationsPage'));
const GuestCheckinPage = lazy(() => import('../features/rooms/pages/GuestCheckinPage'));

import StaffGate from '../components/auth/StaffGate';
const GuestsPage = lazy(() => import('../features/rooms/pages/GuestsPage'));

const ReportsPage = lazy(() => import('../features/management/pages/ReportsPage'));
const ExpensesPage = lazy(() => import('../features/management/pages/ExpensesPage'));
const PricingPage = lazy(() => import('../features/management/pages/PricingPage'));
const SettingsPage = lazy(() => import('../features/rooms/pages/SettingsPage'));
const PasswordSetupPage = lazy(() => import('../components/auth/PasswordSetupPage'));
const PlatformAdminPage = lazy(() => import('../features/admin/PlatformAdminPage'));
const InvoicePage = lazy(() => import('../features/billing/InvoicePage'));
const PropertyProfilePage = lazy(() => import('../features/billing/PropertyProfilePage'));

const AiosellPreviewPage=lazy(()=>import('../features/rooms/pages/AiosellPreviewPage'));
const AdminPreviewPage=lazy(()=>import('../features/admin/AdminPreviewPage'));

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/preview/admin" element={<Suspense fallback={<AppLoader fullPage/>}><AdminPreviewPage/></Suspense>}/>
      <Route path="/preview/aiosell" element={<Suspense fallback={<AppLoader fullPage/>}><AiosellPreviewPage/></Suspense>}/>
      <Route path="/auth/set-password" element={<Suspense fallback={<AppLoader fullPage/>}><PasswordSetupPage /></Suspense>} />
      <Route path="/auth/reset-password" element={<Suspense fallback={<AppLoader fullPage/>}><PasswordSetupPage /></Suspense>} />
      <Route path="/guest-check-in" element={<Suspense fallback={<AppLoader fullPage/>}><GuestCheckinPage /></Suspense>} />
      <Route path="/godfather/*" element={<Suspense fallback={<AppLoader fullPage/>}><PlatformAdminPage /></Suspense>} />
      <Route path="/invoice/:reservationId" element={<Suspense fallback={<AppLoader fullPage/>}><InvoicePage /></Suspense>} />
      <Route element={<StaffGate><AppLayout /></StaffGate>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/stayview" element={<StayViewPage />} />
        <Route path="/allocation" element={<Navigate to="/stayview" replace />} />
        <Route path="/reservations" element={<ReservationsPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/guests" element={<GuestsPage />} />
        <Route path="/housekeeping" element={<HousekeepingPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/property-profile" element={<PropertyProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
