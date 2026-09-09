"use client";
import { useMemo,useState } from "react";
import type { ControlProject } from "@/lib/control-store";
import { tripReference } from "@/lib/trip-baseline";
import { companyName } from "@/lib/business";
import { ageLabel,sourceAge,delta } from "@/lib/control-math";
import { formatearValor } from "@/lib/format";
import { LineChart } from "./LineChart";

const count=(n:number|null|undefined)=>formatearValor(n,"count");
const change=(current:number|null|undefined,reference:number|null|undefined)=>{const d=delta(current??null,reference??null);return d.value===null?d.label:`${d.value>0?"+":""}${d.value.toFixed(1)}%`;};
export function TripBaselineDashboard({projects,now}:{projects:ControlProject[];now:number}) {
 const project=projects.find(p=>p.analytics?.datasets.some(d=>d.id==="transporte_negocio_horario"));
 const live=project?.analytics?.datasets.find(d=>d.id==="transporte_negocio_horario");
 const history=project?.analytics?.datasets.find(d=>d.id==="viajes_baseline_historico");
 const [company,setCompany]=useState("");const [weeks,setWeeks]=useState(8);
 const data=useMemo(()=>live?.rows.length?tripReference(live,history,company,weeks):null,[live,history,company,weeks]);
 if(!data)return <div className="control-empty">Todavía no hay datos de tránsito disponibles para tu perfil.</div>;
 const actualToday=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Argentina/Buenos_Aires"}).format(new Date(now));
 const stale=(sourceAge(data.measured,now)??Infinity)>10||actualToday!==data.date;
 const weekday=new Intl.DateTimeFormat("es-AR",{weekday:"long",timeZone:"UTC"}).format(new Date(data.date+"T12:00:00Z"));
 const warning=project?.analytics?.warnings.filter(w=>w.startsWith("Referencia de viajes:")||w.startsWith("Alarmbot "))??[];
 const latestHour=data.closed?`${String(data.closed-1).padStart(2,"0")}:00–${String(data.closed).padStart(2,"0")}:00`:"Sin horas cerradas";
 return <div className="business-board trips-board">
  <div className="business-title"><div><span className="business-kicker">TRÁNSITO DE HOY / ALARMBOT</span><h1>¿Cómo vienen los viajes?<br/><span>Hoy frente a lo habitual.</span></h1></div><div className="business-source"><i/>{data.date} · {ageLabel(sourceAge(data.measured,now))}<small>Actualización cada 5 minutos · hora Argentina</small></div></div>
  <div className="business-toolbar"><label>Empresa<select value={company} onChange={e=>setCompany(e.target.value)}><option value="">Todas las empresas</option>{data.companies.map(c=><option value={c} key={c}>{companyName(c)}</option>)}</select></label><label>Referencia<select value={weeks} onChange={e=>setWeeks(Number(e.target.value))}><option value={8}>Últimas 8 semanas</option><option value={4}>Últimas 4 semanas</option></select></label><span className="trip-reference-label">Mismo día de semana ({weekday}), misma hora</span></div>
  {(stale||!data.covered)&&<p className="control-alert">{!data.covered?"Faltan empresas en la consulta. No se muestra un total incompleto como si fuera el total general.":`La última lectura corresponde a ${data.date}, ${data.cut.slice(0,5)}. Los datos no están actualizados.`}</p>}
  <div className="business-context"><strong>{company?companyName(company):`${data.selected.length} empresas`} · comparación hasta las {String(data.closed).padStart(2,"0")}:00</strong><span>Viajes = estados 0 y 255 · todos los valores de ativo</span></div>
  <div className="business-cards">
   <section className="business-card"><span>Viajes de hoy</span><strong>{count(data.today)}</strong><small>Incluye la hora en curso. No se compara contra horas históricas completas.</small></section>
   <section className="business-card"><span>Acumulado comparable</span><strong>{count(data.total?.actual)}</strong><small>Desde las 00:00 hasta las {String(data.closed).padStart(2,"0")}:00. Sólo horas cerradas.</small></section>
   <section className="business-card"><span>Acumulado habitual</span><strong>{count(data.total?.median)}</strong><small>Mediana de {data.total?.n??0} {weekday} anteriores con cobertura completa.{(data.total?.n??0)<4?" Referencia todavía insuficiente.":""}</small></section>
   <section className="business-card"><span>Diferencia frente a lo habitual</span><strong>{(data.total?.n??0)>=4?change(data.total?.actual,data.total?.median):"Sin base suficiente"}</strong><small>{(data.total?.n??0)>=4&&data.total?.actual!==null?`${count((data.total?.actual??0)-(data.total?.median??0))} viajes respecto de la referencia.`:"Se necesitan al menos cuatro semanas comparables."}</small></section>
  </div>
  <div className="trip-current-hour"><strong>Hora en curso · {data.cut.slice(0,2)}:00</strong><span>{count(data.partial)} viajes registrados hasta las {data.cut.slice(0,5)}.</span><span className="source-mode snapshot">Incompleta · fuera de la comparación</span></div>
  <section className="business-chart"><div className="business-section-heading"><div><h2>Viajes de cada hora</h2><p>La línea verde muestra hoy. La referencia compara cada hora con los mismos {weekday} de las últimas {weeks} semanas.</p></div><div className="business-deltas"><strong>{count(data.last?.actual)} viajes</strong><small>{latestHour} · {(data.last?.n??0)>=4?change(data.last?.actual,data.last?.median):"sin base suficiente"} vs. habitual</small></div></div><LineChart format="count" lines={data.hourlyLines}/><p className="business-footnote">Rango habitual: percentiles 25–75 (mitad central de las observaciones), no intervalo de confianza. Sólo se muestra con cuatro o más semanas; las referencias con menos muestras son preliminares.</p></section>
  <section className="business-chart"><h2>Cómo se acumulan los viajes durante el día</h2><p>Hasta la misma hora. La referencia se calcula sobre los acumulados de cada día histórico.</p><LineChart format="count" lines={data.cumulativeLines}/></section>
  <section className="business-table"><h2>{company?"Detalle hora por hora":"Qué empresas explican la diferencia"}</h2><p>{company?"Cada hora cerrada contra su referencia. Las horas futuras quedan sin dato de hoy.":"Ordenadas por diferencia absoluta en viajes hasta el corte. Seleccioná una empresa para ver sus curvas horarias."}</p><div className="tabla-envoltorio"><table><thead>{company?<tr><th>Hora</th><th>Hoy</th><th>Habitual</th><th>Rango P25–P75</th><th>Semanas</th><th>Variación</th></tr>:<tr><th>Empresa</th><th>Hoy hasta el corte</th><th>Habitual</th><th>Diferencia</th><th>Semanas</th></tr>}</thead><tbody>{company?data.byHour.map(p=><tr key={p.hour}><td>{String(p.hour).padStart(2,"0")}:00–{String(p.hour+1).padStart(2,"0")}:00</td><td>{count(p.actual)}</td><td>{count(p.median)}</td><td>{p.low===null?"Sin base suficiente":`${count(p.low)}–${count(p.high)}`}</td><td>{p.n}</td><td>{p.n>=4?change(p.actual,p.median):"—"}</td></tr>):data.table.map(p=><tr key={p.company}><td><button onClick={()=>setCompany(p.company)}>{companyName(p.company)}</button></td><td>{count(p.actual)}</td><td>{count(p.median)}</td><td>{p.n>=4?count(p.difference):"Sin base suficiente"}</td><td>{p.n}</td></tr>)}</tbody></table></div></section>
  <details className="business-definitions"><summary>De dónde sale la referencia y qué cobertura tiene</summary><p>Alarmbot consulta el histórico por hora del viaje (sam_dt), con estados 0 y 255, y deduplica por token dentro de cada fecha. Cada ventana completa se guarda una sola vez; las exportaciones superpuestas nunca se suman. La mediana reduce el peso de días extremos; no corrige feriados ni cambios de servicio.</p><p>Fechas buscadas: {data.wanted.join(", ")}. El número de muestras indica las fechas efectivamente disponibles para cada hora y empresa. Para el total, se suman las mismas empresas por fecha antes de calcular la mediana; no se suman medianas individuales.</p><p>Los CSV antiguos de última hora miden recepción y los de 48 horas no identifican el mismo universo de viajes. Siguen en “Otros indicadores”; la referencia se reconstruye con consultas históricas de Alarmbot para mantener una definición única.</p>{warning.map(w=><p key={w}>{w}</p>)}</details>
 </div>;
}
