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

    // Sin el try, un corte de red deja el botón en "Entrando…" para siempre y
    // sin ningún mensaje: el formulario queda muerto y no se entiende por qué.
    let res: Response;
    try {
      res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, clave }),
      });
    } catch {
      setError("No hay conexión con el servidor. Probá de nuevo.");
      setEnviando(false);
      return;
    }

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
        <p className="login-sub">Tableros de recaudación, operación y monitoreo de flota.</p>

        <label className="login-campo">
          <span>Usuario</span>
          <input
            type="text"
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

        {error && <p className="login-error" role="alert">{error}</p>}

        <button type="submit" className="login-boton" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
