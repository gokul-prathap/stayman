import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { usePropertyData } from '../../reservations/hooks/usePropertyData';
import { useStaff } from '../../../components/auth/StaffGate';
import { dayInZone, shiftDay, reportMetrics, money, nights } from '../utils/metrics';
import PageState from '../components/PageState';
import '../management.css';
import RefundReport from '../components/RefundReport';
const tabs = ['Occupancy', 'Revenue', 'ADR', 'Utilization', 'Arrivals/Departures', 'Refunds'];
function Chart({ days, field, label, bars = false }) {
  const width = 720, height = 160, padding = 18;
  const max = Math.max(1, ...days.map(d => d[field]));
  const min = Math.min(0, ...days.map(d => d[field]));
  const baseline = height - padding - (0-min)/(max-min)*(height-padding*2);
  const points = days.map((d, i) => [padding + i * (width - padding * 2) / Math.max(1, days.length - 1), height - padding - (d[field]-min) / (max-min) * (height - padding * 2)]);
  return <figure className="mt-5"><svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={label} className="w-full max-h-64">
    {[0, 1, 2, 3].map(i => <line key={i} x1="0" x2={width} y1={padding + i * 40} y2={padding + i * 40} stroke="#edf1f8" />)}
    {bars ? points.map(([x, y], i) => <rect key={days[i].day} x={x - Math.min(14, 200 / days.length)} y={Math.min(y,baseline)} width={Math.min(28, 400 / days.length)} height={Math.abs(baseline - y)} rx="3" fill="#4b82f7"><title>{days[i].day}: {field === 'earned' || field === 'cash' ? money(days[i][field]) : days[i][field].toFixed(1)}</title></rect>) : <>
      <polygon points={padding + ',' + (height - padding) + ' ' + points.map(p => p.join(',')).join(' ') + ' ' + (width - padding) + ',' + (height - padding)} fill="#eff4ff" />
      <polyline points={points.map(p => p.join(',')).join(' ')} fill="none" stroke="#416cf4" strokeWidth="3" />
      {points.map(([x, y], i) => <circle key={days[i].day} cx={x} cy={y} r={days.length > 40 ? 1 : 4} fill="#416cf4"><title>{days[i].day}: {days[i][field].toFixed(1)}</title></circle>)}
    </>}
  </svg><figcaption className="mt-2 flex justify-between text-xs text-gray-400"><span>{days[0]?.day}</span><span>{days[Math.floor(days.length / 2)]?.day}</span><span>{days.at(-1)?.day}</span></figcaption></figure>;
}
export default function ReportsPage() {
  const { property } = useStaff();
  const { data, isPending, error, refresh } = usePropertyData();
  const [tab, setTab] = useState('Occupancy');
  const [from, setFrom] = useState(() => shiftDay(dayInZone(new Date(), property.timezone), -6));
  const [to, setTo] = useState(() => dayInZone(new Date(), property.timezone));
  const valid = from && to && to >= from && nights(from, to) <= 365;
  const report = useMemo(() => data && valid ? reportMetrics(data, from, to, property.timezone) : null, [data, from, to, valid, property.timezone]);
  const previous = useMemo(() => data && valid ? reportMetrics(data, shiftDay(from, -nights(from, shiftDay(to, 1))), shiftDay(from, -1), property.timezone) : null, [data, from, to, valid, property.timezone]);
  function exportCSV() {
    const rows = [['Date','Occupied unit nights','Available unit nights','Maintenance unit nights','Occupancy percent','Stay revenue INR','Net receipts INR'],
      ...report.days.map(d => [d.day,d.occupied,d.available,d.blocked,d.occupancy.toFixed(2),(d.earned/100).toFixed(2),(d.cash/100).toFixed(2)])];
    const url = URL.createObjectURL(new Blob([rows.map(row => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href=url; link.download='stayman-report-' + from + '.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const shift = amount => { setFrom(shiftDay(from, amount)); setTo(shiftDay(to, amount)); };
  return <section className="management space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1>Reports</h1><p className="subtitle">A clear view of {property.name}'s performance.</p></div><button onClick={exportCSV} disabled={!report} className="secondary flex items-center gap-2"><Download size={15} />Export CSV</button></div>
    <div className="tabs" role="tablist" aria-label="Report category">{tabs.map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#e7edf5] bg-white p-4">
      <CalendarDays size={18} className="mb-3 text-gray-400" /><label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
      <div className="flex gap-2 sm:ml-auto"><button className="secondary" aria-label="Previous period" disabled={!valid} onClick={() => shift(-nights(from, shiftDay(to, 1)))}><ChevronLeft size={17}/></button><button className="secondary" aria-label="Next period" disabled={!valid} onClick={() => shift(nights(from, shiftDay(to, 1)))}><ChevronRight size={17}/></button></div>
    </div>
    {!valid && <p role="alert" className="error">Choose a valid date range of up to 366 days.</p>}
    <PageState pending={isPending} error={error} retry={refresh} />
    {report && !error && tab==='Refunds' && <RefundReport data={data} from={from} to={to} timezone={property.timezone}/>}
    {report && !error && tab!=='Refunds' && <>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="card"><h2>{tab === 'Utilization' ? 'Unit Utilization' : 'Occupancy Rate'}</h2><div className="mt-6 flex flex-wrap items-center gap-6">
          <div className="relative h-32 w-32 shrink-0"><svg viewBox="0 0 120 120" role="img" aria-label={report.occupancy.toFixed(1) + ' percent occupancy'}><circle cx="60" cy="60" r="49" fill="none" stroke="#e8eef7" strokeWidth="9"/><circle cx="60" cy="60" r="49" fill="none" stroke="#4772f4" strokeWidth="9" strokeDasharray={Math.min(100,tab === 'Utilization' ? report.utilization : report.occupancy) * 3.079 + ' 308'} transform="rotate(-90 60 60)" /></svg><span className="absolute inset-0 flex items-center justify-center text-2xl font-bold">{Math.round(tab === 'Utilization' ? report.utilization : report.occupancy)}%</span></div>
          <div><p className="text-xl font-bold">{report.occupied} / {report.available}</p><p className="muted mt-1">occupied / available unit nights</p><p className="mt-3 text-xs font-semibold text-emerald-600">{(report.occupancy-previous.occupancy).toFixed(1)} percentage points vs previous period</p></div>
        </div></article>
        <article className="card"><h2>{tab === 'ADR' ? 'Average Daily Rate' : 'Stay Revenue'}</h2><p className="metric mt-5">{money(tab === 'ADR' ? report.adr : report.earned)}</p><p className="muted mt-1">{tab === 'ADR' ? 'Revenue per occupied unit night' : 'Booking value allocated across nights in this period'}</p><Chart days={report.days} field="earned" bars label="Stay revenue by date" /></article>
      </div>
      {tab === 'Arrivals/Departures' ? <div className="grid gap-4 lg:grid-cols-2">{[['Arrivals',report.arrivals],['Departures',report.departures]].map(([label,rows]) => <article key={label} className="card"><h2>{label} <span className="muted">({rows.length})</span></h2><div className="mt-4 overflow-x-auto"><table><thead><tr><th>Guest</th><th>Date</th><th>Status</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{data.guests.find(g => g.id === r.guest_id)?.full_name}</td><td>{label === 'Arrivals' ? r.check_in_date : r.check_out_date}</td><td>{r.status}</td></tr>)}{!rows.length && <tr><td colSpan={3}>None in this period.</td></tr>}</tbody></table></div></article>)}</div> :
      <article className="card"><div className="flex items-center justify-between"><h2>{tab === 'Revenue' ? 'Daily Net Payment Receipts' : tab === 'ADR' ? 'Daily Stay Revenue' : 'Daily Occupancy'}</h2><span className="muted">{property.timezone || 'Asia/Kolkata'}</span></div><Chart days={report.days} field={tab === 'Revenue' ? 'cash' : tab === 'ADR' ? 'earned' : 'occupancy'} label="Daily property performance" bars={tab === 'Revenue'} /></article>}
      <div className="grid gap-4 sm:grid-cols-3"><article className="card"><p className="muted">Net receipts in period</p><p className="mt-2 text-xl font-bold">{money(report.cash)}</p></article><article className="card"><p className="muted">Opening / initial balances in period</p><p className="mt-2 text-xl font-bold">{money(report.opening)}</p></article><article className="card"><p className="muted">Unit utilization (includes blocked capacity)</p><p className="mt-2 text-xl font-bold">{report.utilization.toFixed(1)}%</p></article></div>
      <p className="muted">Occupancy counts reservations and checked-in stays; checkout day is excluded. Maintenance reduces available capacity. Stay revenue and money received are separate measures. Opening balances have no verified historic receipt date.</p>
      <details className="card"><summary className="cursor-pointer text-sm font-semibold">View daily figures</summary><div className="mt-4 overflow-x-auto"><table><thead><tr><th>Date</th><th>Occupied</th><th>Available</th><th>Occupancy</th><th>Stay revenue</th><th>New receipts</th></tr></thead><tbody>{report.days.map(d => <tr key={d.day}><td>{d.day}</td><td>{d.occupied}</td><td>{d.available}</td><td>{d.occupancy.toFixed(1)}%</td><td>{money(d.earned)}</td><td>{money(d.cash)}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
