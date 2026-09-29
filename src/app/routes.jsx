export const routes = {
  dashboard: {
    path: "/",
    label: "Dashboard",
  },

  allocation: {
    path: "/allocation",
    label: "Allocation",
  },

  reservations: {
    path: "/reservations",
    label: "Reservations",
  },

  rooms: {
    path: "/rooms",
    label: "Rooms & Beds",
  },

  guests: {
    path: "/guests",
    label: "Guests",
  },

  checkin: {
    path: "/check-in",
    label: "Check-in / Check-out",
  },

  payments: {
    path: "/payments",
    label: "Payments",
  },

  housekeeping: {
    path: "/housekeeping",
    label: "Housekeeping",
  },

  reports: {
    path: "/reports",
    label: "Reports",
  },

  settings: {
    path: "/settings",
    label: "Settings",
  },
};

export const routeList = Object.values(routes);

export function getRouteByPath(pathname) {
  return (
    routeList.find((route) => route.path === pathname) ||
    routes.dashboard
  );
}