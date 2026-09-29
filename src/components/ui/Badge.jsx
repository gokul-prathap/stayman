const styles = {
  checked_in: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  vacant: "bg-slate-50 text-slate-500 ring-slate-200",
  maintenance: "bg-slate-100 text-slate-600 ring-slate-300",
  confirmed: "bg-blue-50 text-blue-700 ring-blue-200",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  partial: "bg-amber-50 text-amber-700 ring-amber-200",
};

export default function Badge({ status, children }) {
  const label =
    children ||
    status?.replaceAll("_", " ");

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${
        styles[status] || styles.vacant
      }`}
    >
      {label}
    </span>
  );
}