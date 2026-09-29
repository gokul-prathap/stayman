import { NavLink } from "react-router-dom";
import {
  BarChart3,
  BedDouble,
  CalendarDays,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogIn,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

const navigation = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Allocation", path: "/allocation", icon: CalendarDays },
  { label: "Reservations", path: "/reservations", icon: ClipboardList },
  { label: "Rooms & Beds", path: "/rooms", icon: BedDouble },
  { label: "Guests", path: "/guests", icon: Users },
  { label: "Check-in / Check-out", path: "/check-in", icon: LogIn },
  { label: "Payments", path: "/payments", icon: CreditCard },
  { label: "Housekeeping", path: "/housekeeping", icon: Sparkles },
  { label: "Reports", path: "/reports", icon: BarChart3 },
  { label: "Settings", path: "/settings", icon: Settings },
];

export default function Sidebar({ onNavigate }) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center border-b border-slate-200 px-5">
        <div>
          <div className="text-xl font-bold tracking-tight text-slate-900">
            Stayman
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Property Management
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navigation.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            onClick={onNavigate}
            end={path === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`
            }
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-700">
            Stayman
          </div>

          <div className="mt-1 text-xs text-slate-400">
            Hostel & Homestay Management
          </div>
        </div>
      </div>
    </aside>
  );
}   