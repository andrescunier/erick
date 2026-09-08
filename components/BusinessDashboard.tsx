"use client";
import { useMemo, useState } from "react";
import type { ControlProject } from "@/lib/control-store";
import { companyName, dailyBusiness, liveBusiness } from "@/lib/business";
import { delta, ageLabel, sourceAge } from "@/lib/control-math";
import { formatearValor } from "@/lib/format";
import { LineChart } from "./LineChart";

const money = (n: number | null | undefined) => formatearValor(n,"money_cents");
const count = (n: number | null | undefined) => formatearValor(n,"count");
function Change({now,before,label}:{now:number|null|undefined;before:number|null|undefined;label:string}) {
  const d=delta(now ?? null,before ?? null);
  return <span className={`business-change ${d.value !== null && d.value < 0 ? "negative" : ""}`}>{d.value===null ? d.label : `${d.value>0?"+":""}${d.value.toFixed(1)}%`} <span>{label}</span></span>;
}
function Card({title,value,note,children}:{title:string;value:string;note:string;children?:React.ReactNode}) {
  return <section className="business-card"><span>{title}</span><strong>{value}</strong>{children}<small>{note}</small></section>;
}

export function BusinessDashboard({projects,now}:{projects:ControlProject[];now:number}) {
  const project=projects.find(p=>p.analytics?.datasets.some(d=>d.id==="resumen_diario"));
  const [view,setView]=useState("live");
  const [company,setCompany]=useState("");
  const [date,setDate]=useState("");
  const [evolution,setEvolution]=useState<"amount"|"paid">("amount");
  const liveDataset=project?.analytics?.datasets.find(d=>d.id==="transporte_negocio_horario");
  const dailyDataset=project?.analytics?.datasets.find(d=>d.id==="detalle_estados_PRESENTACION");
  const collectionDataset=project?.analytics?.datasets.find(d=>d.id==="transporte_cobranza_capturas");
  const live=useMemo(()=>liveDataset?.rows.length ? liveBusiness(liveDataset,company,"amount") : null,[liveDataset,company]);
  const collection=useMemo(()=>collectionDataset?.rows.length ? liveBusiness(collectionDataset,company) : null,[collectionDataset,company]);
  const daily=useMemo(()=>dailyDataset?.rows.length ? dailyBusiness(dailyDataset,company,date) : null,[dailyDataset,company,date]);
  if(!project) return <div className="control-empty">Tu perfil no tiene un proyecto de transporte con datos de negocio. Podés consultar tus proyectos en la vista de detalle.</div>;
  const companies=(view==="live"?live?.companies:daily?.companies) ?? [];
  const good=live?.coverage[0];
  const current=good?live?.latest:null;
  const paidRate=current && current.trips ? current.paidTrips/current.trips*100 : null;
  const warnings=project.analytics?.warnings.filter(w=>w.startsWith("Alarmbot ")) ?? [];
  const comparison=evolution==="paid" ? collection : live;
  return <div className="business-board">
    <div className="business-title"><div><span className="business-kicker">TRANSPORTE / RESULTADOS</span><h1>Cuánto cobramos.<br/><span>Cómo viene el negocio.</span></h1></div>
      <div className="business-source"><i/>{view==="live" ? "Alarmbot · actualización cada 5 min" : "Opentransit · cierre por fecha de proceso"}<small>{view==="live" ? `Última consulta ${ageLabel(sourceAge(live?.measured ?? "",now))}` : `Exportación ${dailyDataset?.updatedAt.slice(0,10) ?? "sin fecha"}`}</small></div></div>
    <div className="business-toolbar"><div className="business-tabs"><button className={view==="live"?"active":""} onClick={()=>{setView("live");setCompany("");}}>Durante el día</button><button className={view==="daily"?"active":""} onClick={()=>{setView("daily");setCompany("");}}>Cobros por día</button></div>
      <label>Empresa<select value={company} onChange={e=>setCompany(e.target.value)}><option value="">Todas las empresas</option>{companies.map(c=><option value={c} key={c}>{companyName(c)}</option>)}</select></label>
      {view==="daily" && daily && <label>Fecha de proceso<select value={date || daily.date} onChange={e=>setDate(e.target.value)}>{[...daily.dates].reverse().map(d=><option key={d}>{d}</option>)}</select></label>}
    </div>
    {view==="live" && (!live ? <div className="control-empty">Todavía no hay una consulta de Alarmbot disponible. El histórico diario se puede consultar en “Cobros por día”.</div> : <>
      <div className="business-context"><strong>{live.date} · {company ? companyName(company) : `${live.selected.length} empresas`}</strong><span>Importes en ARS · agrupados por hora del viaje</span></div>
      {(!good || warnings.length>0 || (sourceAge(live.measured ?? "",now) ?? Infinity)>10) && <p className="control-alert">{!good ? "Cobertura incompleta: no se publica un total general como si estuvieran todas las empresas." : "Hay consultas atrasadas o fallidas; se conserva la fecha de la última captura."} Revisá el detalle de fuentes.</p>}
      <div className="business-cards"><Card title="Cobrado de los viajes de hoy" value={money(current?.paid)} note="Viajes con ativo 1. Incluye la hora en curso."/>
        <Card title="Importe todavía sin cobrar" value={money(current?.pending)} note={`${count(current?.pendingTrips)} viajes con ativo distinto de 1.`}/>
        <Card title="Viajes realizados" value={count(current?.trips)} note="Estados 0 y 255; los demás taps se excluyen."/>
        <Card title="Viajes cobrados" value={paidRate===null?"—":`${paidRate.toFixed(1)}%`} note={`${count(current?.paidTrips)} viajes cobrados sobre el total de viajes.`}/></div>
      {Boolean(current?.missing) && <p className="business-quality">{count(current?.missing)} viajes no tienen importe informado. Los montos muestran sólo la parte conocida; no se estima su tarifa.</p>}
      <section className="business-chart"><div className="business-section-heading"><div><h2>{evolution==="amount" ? "¿La actividad genera más o menos dinero?" : "¿Cómo avanza la cobranza?"}</h2><p>{evolution==="amount" ? "Importe acumulado de los viajes, cobrados o pendientes." : "Cobrado acumulado según lo observado en cada día."} Hasta las {comparison?.cutoff.slice(0,5) ?? "—"}, por hora del viaje.</p>
        <div className="business-tabs"><button className={evolution==="amount"?"active":""} onClick={()=>setEvolution("amount")}>Importe de viajes</button><button className={evolution==="paid"?"active":""} onClick={()=>setEvolution("paid")}>Avance de cobranza</button></div></div><div className="business-deltas"><Change now={comparison?.totals[0]?.[evolution]} before={comparison?.totals[1]?.[evolution]} label="frente a ayer"/><Change now={comparison?.totals[0]?.[evolution]} before={comparison?.totals[2]?.[evolution]} label="frente al mismo día de la semana pasada"/></div></div>
        {comparison && <LineChart format="money_cents" lines={comparison.cumulative.map((points,i)=>({name:[`Hoy · ${comparison.dates[0]}`,`Ayer · ${comparison.dates[1]}`,`Semana anterior · ${comparison.dates[2]}`][i],points,color:["#087f75","#5774c8","#b7a48a"][i],dashed:i>0}))}/>}
        {evolution==="paid" && (!comparison || !comparison.coverage[1] || !comparison.coverage[2]) && <p className="business-quality">Todavía no hay capturas de cobranza de todos los días comparados a esta hora. Se guardan desde hoy; no se usa el estado actual de ayer como si fuera una captura de ayer.</p>}
        <p className="business-footnote">{evolution==="amount" ? "Esta curva mide actividad económica de viajes, no cobranza. Usa los importes conocidos; los registros sin tarifa pueden cambiar cuando se procesan. Ambos días se recortan a la misma hora." : "Esta curva usa capturas tomadas en cada día. Si sus minutos no coinciden, se comparan sólo las horas completas comunes. Los días sin captura quedan sin línea."}</p>
      </section>
      <div className="business-findings"><section><span>OPORTUNIDAD DE COBRO</span><h3>{current?.pendingTrips ? `${count(current.pendingTrips)} viajes todavía sin cobrar` : current ? "No se observan viajes sin cobrar" : "Falta cobertura para calcular pendientes"}</h3><p>{current ? `${money(current.pending)} de importe conocido. Revisá abajo dónde se concentra.` : "Seleccioná una empresa con datos disponibles."}</p></section>
        <section><span>CAMBIO EN EL IMPORTE DE VIAJES</span>{(()=>{const contributors=live.contributions.filter(c=>c.change!==null).sort((a,b)=>Math.abs(b.change!)-Math.abs(a.change!));const first=contributors[0];return first?<><h3>{companyName(first.company)}</h3><p>{first.change!>=0?"Aporta":"Explica una caída de"} {money(Math.abs(first.change!))} {first.change!>=0?"más que ayer":"frente a ayer"} en importe de viajes, hasta el mismo corte.</p></>:<><h3>Sin base comparable</h3><p>Hace falta una consulta correcta de ambos días.</p></>;})()}</section></div>
      <section className="business-table"><h2>¿Dónde está el dinero?</h2><p>Ordenado por monto cobrado. Seleccioná una empresa para investigar su curva.</p><div className="tabla-envoltorio"><table><thead><tr><th>Empresa</th><th>Cobrado hoy</th><th>Sin cobrar</th><th>Viajes</th><th>Cambio en importe de viajes *</th></tr></thead><tbody>{live.contributions.map(c=><tr key={c.company}><td><button onClick={()=>setCompany(c.company)}>{companyName(c.company)}</button></td><td>{money(c.paid)}</td><td>{money(c.pending)}</td><td>{count(c.trips)}</td><td>{c.change===null?"Sin base":`${c.change>0?"+":""}${money(c.change)}`}</td></tr>)}</tbody></table></div><small>* Frente a ayer, cobrados más pendientes. Todos los valores de esta tabla usan el corte común {live.cutoff.slice(0,5)}. Cobrado = viaje con ativo 1.</small></section>
      <details className="business-definitions"><summary>Estados, importes y cobertura</summary><p>{liveDataset?.description}</p><p>Taps excluidos por no ser viaje: {count(current?.excluded)}. “Sin cobrar” no implica por sí solo mora: puede ser procesamiento normal.</p>{warnings.map(w=><p key={w}>{w}</p>)}<div className="tabla-envoltorio"><table><thead><tr><th>Ativo</th><th>Estado</th><th>Taps</th><th>Importe conocido</th></tr></thead><tbody>{(()=>{const grouped=new Map<string,{taps:number;amount:number}>();for(const r of live.byDay[0]){if(r.ativo==="cobertura")continue;const key=`${r.ativo} / ${r.estado}`;const g=grouped.get(key)??{taps:0,amount:0};g.taps+=Number(r.taps);g.amount+=Number(r.monto_cents??0);grouped.set(key,g);}return [...grouped].map(([k,v])=><tr key={k}><td>{k.split(" / ")[0]}</td><td>{k.split(" / ")[1]}</td><td>{count(v.taps)}</td><td>{money(v.amount)}</td></tr>);})()}</tbody></table></div></details>
    </>)}
    {view==="daily" && (!daily ? <div className="control-empty">No hay un cierre disponible para este proyecto.</div> : <>
      <div className="business-context"><strong>Fecha de proceso: {daily.date}</strong><span>{daily.currentCompanies} empresas con datos · estado de presentación del archivo</span></div>
      <div className="business-cards"><Card title="Cobrado informado del día" value={money(daily.current?.paid)} note="Importes clasificados PAID en el archivo de cierre."><Change now={daily.comparableCurrent?.paid} before={daily.comparablePrevious?.paid} label={`vs. ${daily.previousDate} · ${daily.shared} empresas comunes`}/></Card>
        <Card title="Cobrado acumulado del mes" value={money(daily.month?.paid)} note={`Hasta ${daily.date} · ${daily.monthDays} días con datos. No proyectado.`}/>
        <Card title="Sin cobrar informado del día" value={money(daily.current?.unpaid)} note="Importes clasificados UNPAID en el cierre."/>
        <Card title="Monto procesado del día" value={money(daily.current?.amount)} note={`${count(daily.current?.trips)} registros de viajes del archivo.`}/></div>
      <section className="business-chart"><div className="business-section-heading"><div><h2>Cuánto se informa cobrado por día</h2><p>Últimos 30 días hasta el cierre elegido. Cada punto es un día, sin acumularlo con el anterior.</p></div></div><LineChart format="money_cents" lines={[{name:"Cobrado informado · PAID",points:daily.points,color:"#087f75"}]}/><p className="business-footnote">La fecha corresponde al proceso de Opentransit, no al movimiento bancario. Los huecos son días sin archivo; la cantidad de empresas puede variar.</p></section>
      <section className="business-table"><h2>Empresas que explican el resultado</h2><div className="tabla-envoltorio"><table><thead><tr><th>Empresa</th><th>Cobrado informado</th><th>Sin cobrar</th><th>Cambio vs. día anterior</th></tr></thead><tbody>{daily.contributions.map(c=><tr key={c.company}><td><button onClick={()=>setCompany(c.company)}>{companyName(c.company)}</button></td><td>{money(c.paid)}</td><td>{money(c.unpaid)}</td><td>{c.change===null?"Sin base":`${c.change>0?"+":""}${money(c.change)}`}</td></tr>)}</tbody></table></div></section>
      <details className="business-definitions"><summary>Ver importes y cobertura por día</summary><div className="tabla-envoltorio"><table><thead><tr><th>Fecha de proceso</th><th>Cobrado informado</th><th>Empresas con datos</th></tr></thead><tbody>{[...daily.points].reverse().map(p=><tr key={p.label}><td>{p.label}</td><td>{money(p.value)}</td><td>{p.coverage}</td></tr>)}</tbody></table></div></details>
    </>)}
  </div>;
}
