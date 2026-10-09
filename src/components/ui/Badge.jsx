import React from 'react';

const variantStyles = {
  CHECKED_IN: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  PENDING: 'bg-amber-100 text-amber-800 border-amber-300',
  CONFIRMED: 'bg-blue-100 text-blue-800 border-blue-300',
  CHECKED_OUT: 'bg-slate-100 text-slate-700 border-slate-300',
  CANCELLED: 'bg-rose-100 text-rose-800 border-rose-300',
  MAINTENANCE: 'bg-stone-200 text-stone-700 border-stone-400',
  READY: 'bg-teal-100 text-teal-800 border-teal-300',
  DIRTY: 'bg-orange-100 text-orange-800 border-orange-300',
};

// ✅ Correct syntax for default export!
export default function Badge({ status, label }) {
  const style = variantStyles[status] || 'bg-slate-100 text-slate-800 border-slate-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${style}`}>
      {label || status?.replace('_', ' ')}
    </span>
  );
}
