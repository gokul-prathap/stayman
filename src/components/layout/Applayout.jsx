import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [expanded, setExpanded] = useState(true);
  const introTimer = useRef(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    if (media.matches) introTimer.current = window.setTimeout(() => setExpanded(false), 1000);
    const resize = event => {
      window.clearTimeout(introTimer.current);
      setMobile(event.matches);
      setExpanded(!event.matches);
    };
    media.addEventListener('change', resize);
    return () => { window.clearTimeout(introTimer.current); media.removeEventListener('change', resize); };
  }, []);
  const changeExpanded = value => {
    window.clearTimeout(introTimer.current);
    setExpanded(value);
  };
  useEffect(() => {
    if (!mobile || !expanded) return;
    const escape = event => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [mobile, expanded]);
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-50">
      {mobile && expanded && <button type="button" aria-label="Close navigation" onClick={() => changeExpanded(false)}
        className="fixed inset-0 z-40 bg-slate-950/50" />}
      <Sidebar expanded={expanded} mobile={mobile} onToggle={() => changeExpanded(!expanded)}
        onNavigate={() => { if (mobile) changeExpanded(false); }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar expanded={expanded} onToggle={() => changeExpanded(!expanded)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
