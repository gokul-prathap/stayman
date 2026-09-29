import { Menu, Bell } from "lucide-react";
import { useLocation } from "react-router-dom";
import { getRouteByPath } from "../../app/routes";

export default function Topbar({ onMenuClick }) {
  const location = useLocation();
  const currentRoute = getRouteByPath(location.pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={21} />
        </button>

        <div>
          <div className="text-sm font-semibold text-slate-900">
            {currentRoute.label}
          </div>

          <div className="hidden text-xs text-slate-400 sm:block">
            Manage your property
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Notifications"
        >
          <Bell size={19} />

          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium text-slate-700">
            Property Manager
          </div>

          <div className="text-xs text-slate-400">
            Administrator
          </div>
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
          PM
        </div>
      </div>
    </header>
  );
}