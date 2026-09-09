const assert=require('node:assert/strict');
const {loadTS}=require('../scripts/sincronizar_control.cjs');
const {tripReference,quantile}=loadTS('lib/trip-baseline.ts');
assert.equal(quantile([1,3,7,100],.5),5);
assert.equal(quantile([], .5),null);
const live={columns:['fecha','empresa','ativo','estado','taps','corte','consultado_en'],rows:[]};
for(const c of ['A','B'])for(let h=0;h<3;h++)live.rows.push([`2026-09-09T0${h}:00:00`,c,'cobertura','cobertura',0,'2026-09-09T02:25:00','2026-09-09T02:25:01']);
live.rows.push(['2026-09-09T00:00:00','A','0','0',10,'2026-09-09T02:25:00','']);
live.rows.push(['2026-09-09T01:00:00','A','1','255',20,'2026-09-09T02:25:00','']);
live.rows.push(['2026-09-09T02:00:00','A','0','0',100,'2026-09-09T02:25:00','']);
live.rows.push(['2026-09-09T01:00:00','A','1','8',900,'2026-09-09T02:25:00','']);
const history={columns:['fecha','empresa','viajes','consultado_en'],rows:[]};
for(const [i,day] of ['2026-09-02','2026-08-26','2026-08-19','2026-08-12'].entries()){
 for(let h=0;h<24;h++)for(const c of ['A','B'])history.rows.push([`${day}T${String(h).padStart(2,'0')}:00:00`,c,h<2?[0,10,100,200][i]:0,'2026-09-09T00:00:00']);
}
const result=tripReference(live,history);
assert.equal(result.today,130); // estados 0/255, sin importar ativo
assert.equal(result.total.actual,30); // hora parcial excluida
assert.equal(result.partial,100);
assert.equal(result.byHour[2].actual,null);
assert.equal(result.total.n,4);
assert.equal(result.total.median,220); // median([0,40,400,800])
assert.equal(tripReference(live,history,'A').total.median,110);
history.rows.push([...history.rows[0]]);
assert.equal(tripReference(live,history).total.median,220); // superposición no suma
const asymmetric={columns:history.columns,rows:[]};
for(const [i,day] of ['2026-09-02','2026-08-26','2026-08-19'].entries()){
 asymmetric.rows.push([day+'T00:00:00','A',[0,100,100][i],'']);
 asymmetric.rows.push([day+'T01:00:00','A',[100,0,100][i],'']);
}
assert.equal(tripReference(live,asymmetric,'A').total.median,100); // NO 200=sum(medianas)
assert.equal(tripReference(live,asymmetric,'A').total.low,null); // n<4
assert.equal(tripReference(live,asymmetric).total.median,null); // falta B, no usar cero
console.log('Baseline: estados, duplicados, muestras, empresas, mediana acumulada y hora parcial OK');
