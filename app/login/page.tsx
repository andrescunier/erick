"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

export default function PaginaLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const destino = params.get("next") || "/";

  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, clave }),
    });

    if (res.ok) {
      router.replace(destino);
      router.refresh();
      return;
    }

    const cuerpo = await res.json().catch(() => ({}));
    setError(cuerpo.error ?? "No se pudo iniciar sesión.");
    setEnviando(false);
  }

  return (
    <main className="login-main">
      <form className="login-caja" onSubmit={alEnviar}>
        <div className="login-encabezado">
          <Image src="/icono-openpass.webp" alt="OpenPass" width={36} height={35} priority />
          <h1>Erick</h1>
        </div>
        <p className="login-sub">Ingresá para ver los dashboards.</p>

        <label className="login-campo">
          <span>Usuario</span>
          <input
            type="email"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="login-campo">
          <span>Contraseña</span>
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" className="login-boton" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
