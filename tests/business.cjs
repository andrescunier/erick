const assert=require('node:assert/strict');
const {loadTS}=require('../scripts/sincronizar_control.cjs');
const {tripTotals,liveBusiness,dailyBusiness}=loadTS('lib/business.ts');
const rows=[
 {ativo:'1',estado:'0',taps:2,monto_cents:20000,sin_importe:0},
 {ativo:'1',estado:'255',taps:1,monto_cents:10000,sin_importe:0},
 {ativo:'0',estado:'0',taps:1,monto_cents:10000,sin_importe:0},
 {ativo:'2',estado:'255',taps:1,monto_cents:null,sin_importe:1},
 {ativo:'1',estado:'8',taps:8,monto_cents:80000,sin_importe:0}
];
assert.deepEqual(tripTotals(rows),{trips:5,paidTrips:3,amount:40000,paid:30000,pending:10000,pendingTrips:2,missing:1,excluded:8});
const columns=['fecha','empresa','ativo','estado','taps','monto_cents','sin_importe','consultado_en','corte'];
const sample={columns,rows:[]};
for(const day of ['2026-09-08','2026-09-07','2026-09-01']){
 sample.rows.push([day+'T00:00:00','A','cobertura','cobertura',0,0,0,'2026-09-08T12:30:00',day+'T12:30:00']);
 sample.rows.push([day+'T12:00:00','A','1','0',2,100,0,'2026-09-08T12:30:00',day+'T12:30:00']);
}
const live=liveBusiness(sample);
assert.deepEqual(live.coverage,[true,true,true]);
assert.equal(live.cumulative[0][12].value,100);
assert.equal(live.cumulative[0][13].value,null);
assert.equal(live.cumulative[0][0].value,0);
sample.rows[2][8]='2026-09-07T11:35:00';
assert.equal(liveBusiness(sample).cutoff,'11:00:00');
sample.rows.push(['2026-09-08T00:00:00','B','cobertura_fallida','cobertura_fallida',null,null,null,'','2026-09-08T12:30:00']);
assert.equal(liveBusiness(sample).totals[0],null);
assert.equal(liveBusiness(sample,'A').coverage[0],true);
const daily={columns:['fecha','tenant','estado','cantidad','monto_cents'],rows:[
 ['2026-09-08','A','PAID',2,100],['2026-09-08','A','UNPAID',1,20],
 ['2026-09-08','B','PAID',1,1000],['2026-09-07','A','PAID',1,50]]};
const d=dailyBusiness(daily);
assert.equal(d.current.paid,1100);
assert.equal(d.month.paid,1150);
assert.equal(d.current.unpaid,20);
assert.equal(d.comparableCurrent.paid,100);
assert.equal(d.comparablePrevious.paid,50);
assert.equal(d.shared,1);
assert.equal(d.points[0].value,null);
console.log('Negocio: cobrado/viaje, exclusiones, faltantes, corte horario y empresas comparables OK');
