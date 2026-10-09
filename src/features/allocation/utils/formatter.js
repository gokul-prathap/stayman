import { format, parseISO } from 'date-fns';

export function formatCurrency(amountInPaise, currency = 'INR') {
  const numeric = Number(amountInPaise || 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(numeric);
}

export function formatDateDisplay(dateInput) {
  if (!dateInput) return '-';
  const date = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
  return format(date, 'dd MMM yyyy');
}