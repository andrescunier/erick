import { expandRows, type Dataset, type Row } from "./analytics";
import { DAY, type Point } from "./control-math";

export const companyName = (s: string) => s.replace(/^pms-/i, "").replace(/-hml$/i, "").toUpperCase();
export const dateShift = (date: string, days: number) => new Date(Date.parse(date + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);
export const sum = (rows: Row[], key: string) => rows.reduce((n, r) => n + (typeof r[key] === "number" ? Number(r[key]) : 0), 0);
export const isTrip = (r: Row) => ["0", "255"].includes(String(r.estado));
export const isPaid = (r: Row) => isTrip(r) && String(r.ativo) === "1";

export function tripTotals(rows: Row[]) {
  const trips = rows.filter(isTrip), paid = trips.filter(isPaid), pending = trips.filter(r => !isPaid(r));
  const amount = (rs: Row[]) => rs.length && rs.every(r => r.monto_cents === null) ? null : sum(rs, "monto_cents");
  return { trips: sum(trips, "taps"), paidTrips: sum(paid, "taps"), amount:amount(trips), paid: amount(paid), pending: amount(pending),
    pendingTrips: sum(pending, "taps"), missing: sum(trips, "sin_importe"), excluded: sum(rows.filter(r => !isTrip(r)), "taps") };
}

export function liveBusiness(dataset: Dataset, company = "", metric:"paid"|"amount" = "paid") {
  const all = expandRows(dataset);
  const companies = [...new Set(all.map(r => String(r.empresa)))].sort();
  const selected = company ? [company] : companies;
  const rows = all.filter(r => selected.includes(String(r.empresa)));
  const date = all.map(r => String(r.fecha).slice(0,10)).sort().at(-1)!;
  const dates = [date, dateShift(date, -1), dateShift(date, -7)];
  const byDay = dates.map(d => rows.filter(r => String(r.fecha).startsWith(d)));
  const coverage = byDay.map(rs => selected.every(c => rs.some(r => r.empresa === c && r.ativo === "cobertura")));
  const cuts = byDay.flatMap(rs => rs.filter(r => r.ativo === "cobertura").map(r => String(r.corte).slice(11,19)));
  // Si hay una captura vieja, comparar sólo horas completas comunes.
  const sameCut = new Set(cuts).size === 1;
  const cutoff = cuts.sort()[0] ?? "00:00:00";
  const alignedCut = sameCut ? cutoff : cutoff.slice(0,2) + ":00:00";
  const hour = Number(alignedCut.slice(0,2));
  const hasPartial = alignedCut.slice(3) !== "00:00";
  const aligned = byDay.map(rs => rs.filter(r => Number(String(r.fecha).slice(11,13)) < hour + (hasPartial ? 1 : 0)));
  const totals = aligned.map((rs,i) => coverage[i] ? tripTotals(rs) : null);
  const cumulative = aligned.map((rs,dayIndex): Point[] => {
    let running = 0;
    return Array.from({length:24},(_,h) => {
      const bucket = rs.filter(r => Number(String(r.fecha).slice(11,13)) === h);
      const total = tripTotals(bucket);
      if (total[metric] !== null) running += total[metric]!;
      return {label: `${String(h).padStart(2,"0")}:00`, value: !coverage[dayIndex] || h >= hour + (hasPartial ? 1 : 0) ? null : running, coverage: bucket.length};
    });
  });
  const latest = tripTotals(byDay[0]);
  const contributions = selected.map(c => {
    const current = tripTotals(aligned[0].filter(r => r.empresa === c));
    const previous = tripTotals(aligned[1].filter(r => r.empresa === c));
    const covered = aligned[0].some(r=>r.empresa===c && r.ativo==="cobertura");
    const priorCovered = aligned[1].some(r=>r.empresa===c && r.ativo==="cobertura");
    return { company:c, ...current, paid:covered?current.paid:null, pending:covered?current.pending:null, trips:covered?current.trips:null,
      change: covered && priorCovered && current[metric] !== null && previous[metric] !== null ? current[metric]! - previous[metric]! : null };
  }).sort((a,b) => (b.paid ?? 0) - (a.paid ?? 0));
  const measured = rows.filter(r => String(r.fecha).startsWith(date) && r.ativo === "cobertura").map(r => String(r.consultado_en)).sort()[0];
  return {companies,date,dates,byDay,coverage,cutoff:alignedCut,totals,latest,cumulative,contributions,measured,selected};
}

export function dailyBusiness(dataset: Dataset, company = "", selectedDate?: string) {
  const all = expandRows(dataset);
  const companies = [...new Set(all.map(r => String(r.tenant)))].sort();
  const dates = [...new Set(all.map(r => String(r.fecha).slice(0,10)))].sort();
  const date = selectedDate || dates.at(-1)!;
  const rows = all.filter(r => (!company || r.tenant === company) && String(r.fecha).slice(0,10) <= date);
  function totals(rs: Row[]) {
    if (!rs.length) return null;
    const paid = rs.filter(r => r.estado === "PAID"), unpaid = rs.filter(r => r.estado === "UNPAID");
    return {paid:sum(paid,"monto_cents"),unpaid:sum(unpaid,"monto_cents"),amount:sum(rs,"monto_cents"),trips:sum(rs,"cantidad")};
  }
  const current = rows.filter(r => String(r.fecha).slice(0,10) === date);
  const previousDate = dateShift(date,-1), previous = rows.filter(r => String(r.fecha).slice(0,10) === previousDate);
  const currentCompanies = new Set(current.map(r=>String(r.tenant))), previousCompanies = new Set(previous.map(r=>String(r.tenant)));
  const shared = [...currentCompanies].filter(c=>previousCompanies.has(c));
  const monthRows = rows.filter(r => String(r.fecha).startsWith(date.slice(0,7)));
  const points = Array.from({length:30},(_,i) => {
    const d=dateShift(date,i-29), rs=rows.filter(r=>String(r.fecha).slice(0,10)===d);
    return {label:d,value:totals(rs)?.paid ?? null,coverage:new Set(rs.map(r=>r.tenant)).size};
  });
  return {companies,dates,date,previousDate,current:totals(current),month:totals(monthRows),
    monthDays:new Set(monthRows.map(r=>String(r.fecha).slice(0,10))).size,
    currentCompanies:currentCompanies.size,shared:shared.length,
    comparableCurrent:totals(current.filter(r=>shared.includes(String(r.tenant)))),
    comparablePrevious:totals(previous.filter(r=>shared.includes(String(r.tenant)))), points,
    contributions:[...currentCompanies].map(c=>{
      const now=totals(current.filter(r=>r.tenant===c))!,before=totals(previous.filter(r=>r.tenant===c));
      return {company:c,...now,change:before ? now.paid-before.paid : null};
    }).sort((a,b)=>b.paid-a.paid)};
}
