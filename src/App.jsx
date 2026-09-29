import { useState } from "react";
import {
  BedDouble,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Settings,
  Users,
  X,
} from "lucide-react";

const navigation = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Allocation",
    icon: CalendarDays,
  },
  {
    label: "Reservations",
    icon: ClipboardList,
  },
  {
    label: "Rooms & Beds",
    icon: BedDouble,
  },
  {
    label: "Guests",
    icon: Users,
  },
  {
    label: "Settings",
    icon: Settings,
  },
];

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState("Dashboard");

  return (
    <div className="min-h-screen bg-slate-50">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Stayman
            </h1>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Property Management
            </p>
          </div>

          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.label;

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setActivePage(item.label);
                  setSidebarOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">
              Stayman
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Hostel & Homestay Management
            </p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>

            <div>
              <p className="text-sm font-semibold text-slate-900">
                {activePage}
              </p>
              <p className="hidden text-xs text-slate-400 sm:block">
                Manage your property
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-700">
                Property Manager
              </p>
              <p className="text-xs text-slate-400">Administrator</p>
            </div>

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
              PM
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                Welcome to Stayman
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Your property management workspace.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total Beds"
                value="—"
                description="Property inventory"
              />

              <StatCard
                label="Occupied"
                value="—"
                description="Currently checked in"
              />

              <StatCard
                label="Arrivals Today"
                value="—"
                description="Expected check-ins"
              />

              <StatCard
                label="Departures Today"
                value="—"
                description="Expected check-outs"
              />
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-base font-semibold text-slate-900">
                {activePage}
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                The {activePage.toLowerCase()} module will appear here as the
                Stayman features are added.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({ label, value, description }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>

      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-400">{description}</p>
    </div>
  );
}

export default App;