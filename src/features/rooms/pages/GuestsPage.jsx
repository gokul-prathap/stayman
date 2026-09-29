import { useState } from "react";
import Input from "../../../components/ui/Input";

const guests = [
  [
    "Arjun Menon",
    "India",
    "+91 98765 43210",
    "Room 101",
  ],
  [
    "Liam Carter",
    "United Kingdom",
    "+44 7700 900123",
    "Dorm 201-A",
  ],
  [
    "Maya Thomas",
    "India",
    "+91 91234 56789",
    "Dorm 201-B",
  ],
];

export default function GuestsPage() {
  const [query, setQuery] = useState("");

  const filtered = guests.filter((guest) =>
    guest
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">
          Guests
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Guest profiles and stay history.
        </p>
      </div>

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Search guests..."
          value={query}
          onChange={(event) =>
            setQuery(event.target.value)
          }
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-5 py-3">Guest</th>
                <th className="px-5 py-3">Nationality</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Current unit</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filtered.map((guest) => (
                <tr key={guest[0]}>
                  <td className="px-5 py-4 font-medium">
                    {guest[0]}
                  </td>

                  <td className="px-5 py-4">
                    {guest[1]}
                  </td>

                  <td className="px-5 py-4">
                    {guest[2]}
                  </td>

                  <td className="px-5 py-4">
                    {guest[3]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}