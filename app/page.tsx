import resumen from "@/data/resumen.json";

type VentanaComparacion = {
  money_previous_cents: number;
  validators_previous: number;
  money_variation_pct: number;
  validators_variation_pct: number;
  money_per_validator_previous_cents: number;
  money_per_validator_variation_pct: number;
};

type ResumenTenant = {
  tenant: string;
  process_date: string;
  process_ts: string;
  transaction_volume: number;
  money_processed_cents: number;
  tap_count: number;
  average_ticket_cents: number;
  average_transaction_cents: number;
  validators_active_day: number;
  validators_active_7d: number;
  money_per_validator_cents: number;
  month_projection_cents: number;
  unique_cards: number;
  comparison_windows: Record<string, VentanaComparacion>;
};

type Resumen = {
  generado_en: string;
  tenants: Record<string, ResumenTenant>;
};

const datos = resumen as Resumen;

const formatoMoneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const formatoNumero = new Intl.NumberFormat("es-AR");

function plata(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return formatoMoneda.format(cents / 100);
}

function numero(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return formatoNumero.format(n);
}

function Variacion({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return <span>—</span>;
  const signo = pct > 0 ? "+" : "";
  const clase = pct >= 0 ? "pct-pos" : "pct-neg";
  return (
    <span className={clase}>
      {signo}
      {pct.toFixed(1)}%
    </span>
  );
}

export default function Pagina() {
  const filas = Object.values(datos.tenants).sort(
    (a, b) => (b.money_processed_cents ?? 0) - (a.money_processed_cents ?? 0)
  );

  const totalMonto = filas.reduce((acc, t) => acc + (t.money_processed_cents ?? 0), 0);
  const totalTaps = filas.reduce((acc, t) => acc + (t.tap_count ?? 0), 0);
  const totalTarjetas = filas.reduce((acc, t) => acc + (t.unique_cards ?? 0), 0);

  return (
    <main>
      <h1>Panel de Tránsito</h1>
      <p className="generado">
        {filas.length} tenants · generado {new Date(datos.generado_en).toLocaleString("es-AR")}
      </p>

      <div className="tarjetas">
        <div className="tarjeta">
          <div className="rotulo">Procesado (último día por tenant)</div>
          <div className="valor">{plata(totalMonto)}</div>
        </div>
        <div className="tarjeta">
          <div className="rotulo">Taps</div>
          <div className="valor">{numero(totalTaps)}</div>
        </div>
        <div className="tarjeta">
          <div className="rotulo">Tarjetas únicas</div>
          <div className="valor">{numero(totalTarjetas)}</div>
        </div>
        <div className="tarjeta">
          <div className="rotulo">Tenants con dato</div>
          <div className="valor">{filas.length}</div>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="vacio">
          Todavía no hay datos. Corré <code>scripts/sincronizar_resumen.py</code> y volvé a
          desplegar.
        </p>
      ) : (
        <div className="tabla-envoltorio">
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Fecha</th>
                <th>Procesado</th>
                <th>Taps</th>
                <th>Validadores hoy</th>
                <th>Tarjetas únicas</th>
                <th>Var. 1d</th>
                <th>Var. 7d</th>
                <th>Var. 30d</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((t) => (
                <tr key={t.tenant}>
                  <td>{t.tenant}</td>
                  <td>{t.process_date}</td>
                  <td>{plata(t.money_processed_cents)}</td>
                  <td>{numero(t.tap_count)}</td>
                  <td>{numero(t.validators_active_day)}</td>
                  <td>{numero(t.unique_cards)}</td>
                  <td>
                    <Variacion pct={t.comparison_windows?.["1d"]?.money_variation_pct} />
                  </td>
                  <td>
                    <Variacion pct={t.comparison_windows?.["7d"]?.money_variation_pct} />
                  </td>
                  <td>
                    <Variacion pct={t.comparison_windows?.["30d"]?.money_variation_pct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
