import { useId } from 'react';
export default function Input({
  label,
  error,
  className = "",
  ...props
}) {
  const generatedId = useId();
  const inputId = props.id || generatedId;
  const errorId = inputId + '-error';
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </span>
      )}

      <input
        {...props}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : props['aria-describedby']}
        className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none transition ${
          error
            ? "border-red-300 focus:ring-2 focus:ring-red-100"
            : "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
        } ${className}`}
      />

      {error && (
        <span id={errorId} role="status" className="mt-1 block text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}