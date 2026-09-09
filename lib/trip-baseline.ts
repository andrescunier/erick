import { expandRows, type Dataset, type Row } from "./analytics";
import { isTrip, sum, dateShift } from "./business";
import type { Point } from "./control-math";

export function quantile(values:number[],q:number):number|null {
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),position=(sorted.length-1)*q,index=Math.floor(position);
  return sorted[index]+(sorted[Math.ceil(position)]-sorted[index])*(position-index);
}
const hourOf=(r:Row)=>Number(String(r.fecha).slice(11,13));
const dayOf=(r:Row)=>String(r.fecha).slice(0,10);
function stats(values:number[]) {return {median:quantile(values,.5),low:values.length>=4?quantile(values,.25):null,high:values.length>=4?quantile(values,.75):null,n:values.length};}

export function tripReference(live:Dataset,history:Dataset|undefined,company="",weeks=8) {
  const all=expandRows(live),date=all.map(dayOf).sort().at(-1)!;
  const companies=[...new Set(all.map(r=>String(r.empresa)))].sort();
  const selected=company?[company]:companies;
  const current=all.filter(r=>dayOf(r)===date && selected.includes(String(r.empresa)));
  const markers=current.filter(r=>r.ativo==="cobertura");
  const covered=selected.every(c=>markers.some(r=>r.empresa===c));
  const cut=markers.map(r=>String(r.corte).slice(11,19)).sort()[0]??"00:00:00";
  const closed=Number(cut.slice(0,2));
  const wanted=Array.from({length:weeks},(_,i)=>dateShift(date,-7*(i+1)));
  const historic=(history?expandRows(history):[]).filter(r=>wanted.includes(dayOf(r)) && selected.includes(String(r.empresa)));
  // Deduplicar por empresa/fecha/hora antes de agregar; jamás sumar dos capturas.
  const unique=new Map<string,Row>();
  for(const row of historic){const key=`${row.empresa}|${row.fecha}`;const old=unique.get(key);if(!old || String(row.consultado_en)>String(old.consultado_en))unique.set(key,row);}
  const lookup=new Map<string,number>();
  for(const r of unique.values())if(typeof r.viajes==="number")lookup.set(`${r.empresa}|${dayOf(r)}|${hourOf(r)}`,r.viajes);
  const byHour=Array.from({length:24},(_,h)=>{
    const rows=current.filter(r=>hourOf(r)===h);
    const samples=wanted.flatMap(day=>{
      const counts=selected.map(c=>lookup.get(`${c}|${day}|${h}`));
      return counts.every(n=>n!==undefined)?[counts.reduce<number>((a,b)=>a+b!,0)]:[];
    });
    return {hour:h,actual:covered && h<closed?sum(rows.filter(isTrip),"taps"):null,...stats(samples)};
  });
  // Acumulados: mediana de los acumulados diarios, NO suma de medianas horarias.
  const cumulative=Array.from({length:24},(_,h)=>{
    const samples=wanted.flatMap(day=>{
      const counts=selected.flatMap(c=>Array.from({length:h+1},(_,j)=>lookup.get(`${c}|${day}|${j}`)));
      return counts.every(n=>n!==undefined)?[counts.reduce<number>((a,b)=>a+b!,0)]:[];
    });
    return {hour:h,actual:covered && h<closed?sum(current.filter(r=>hourOf(r)<=h && isTrip(r)),"taps"):null,...stats(samples)};
  });
  const point=(p:typeof byHour[number],value:number|null):Point=>({label:`${String(p.hour).padStart(2,"0")}:00–${String(p.hour+1).padStart(2,"0")}:00`,value,coverage:p.n});
  const lines=(values:typeof byHour)=>[
    {name:"Hoy · horas cerradas",color:"#087f75",points:values.map(p=>point(p,p.actual))},
    {name:"Habitual · mediana",color:"#647bb9",dashed:true,points:values.map(p=>point(p,p.median))},
    {name:"Rango habitual · P25",color:"#c3cdbd",dashed:true,points:values.map(p=>point(p,p.low))},
    {name:"Rango habitual · P75",color:"#a2b29c",dashed:true,points:values.map(p=>point(p,p.high))}
  ];
  const measured=markers.map(r=>String(r.consultado_en)).sort()[0]??"";
  const table=companies.map(c=>{
    const rs=current.filter(r=>r.empresa===c);
    const valid=rs.some(r=>r.ativo==="cobertura");
    const samples=closed?wanted.flatMap(day=>{
      const counts=Array.from({length:closed},(_,h)=>lookup.get(`${c}|${day}|${h}`));
      return counts.every(n=>n!==undefined)?[counts.reduce<number>((a,b)=>a+b!,0)]:[];
    }):[];
    const baseline=stats(samples),actual=valid&&closed?sum(rs.filter(r=>hourOf(r)<closed && isTrip(r)),"taps"):null;
    return {company:c,actual,...baseline,difference:actual!==null&&baseline.median!==null?actual-baseline.median:null};
  }).filter(r=>!company || r.company===company).sort((a,b)=>Math.abs(b.difference??0)-Math.abs(a.difference??0));
  return {date,companies,selected,covered,closed,cut,measured,wanted,byHour,cumulative,
    hourlyLines:lines(byHour),cumulativeLines:lines(cumulative),last:closed?byHour[closed-1]:null,
    total:closed?cumulative[closed-1]:null,partial:covered?sum(current.filter(r=>hourOf(r)===closed && isTrip(r)),"taps"):null,
    today:covered?sum(current.filter(isTrip),"taps"):null,table};
}
