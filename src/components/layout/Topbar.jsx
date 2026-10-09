import React from 'react';
import { Bell, Search } from 'lucide-react';

export function Topbar() {
  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
      <div className="flex items-center gap-3 w-96">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search reservation, guest or phone..."
          className="w-full text-sm bg-transparent border-none focus:outline-none placeholder-slate-400"
        />
      </div>
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-slate-500 hover:text-slate-700">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full"></span>
        </button>
        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
            VJ
          </div>
          <div className="text-left text-xs">
            <p className="font-semibold text-slate-800">Vikram Joshi</p>
            <p className="text-slate-500">Manager</p>
          </div>
        </div>
      </div>
    </header>
  );
}