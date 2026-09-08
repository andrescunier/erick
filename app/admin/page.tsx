"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type UserView = {
  username: string;
  allowed: string[];
  admin: boolean;
};

export default function PaginaAdmin() {
  const [users, setUsers] = useState<UserView[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulario crear
  const [nuevoUser, setNuevoUser] = useState("");
  const [nuevoPass, setNuevoPass] = useState("");
  const [nuevoAllowed, setNuevoAllowed] = useState("*");
  const [nuevoAdmin, setNuevoAdmin] = useState(false);
  const [creando, setCreando] = useState(false);

  // Editar
  const [editando, setEditando] = useState<string | null>(null);
  const [editAllowed, setEditAllowed] = useState("");
  const [editAdmin, setEditAdmin] = useState(false);
  const [editPass, setEditPass] = useState("");
  const [guardando, setGuardando] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/login");
      const sesion = await res.json();
      if (!sesion.admin) {
        setError("No tenés permisos de administrador.");
        setCargando(false);
        return;
      }
      // Usamos la sesión para saber que estamos autenticados,
      // pero la API de users requiere API key — la admin page
      // llama a /api/users via un endpoint interno que acepta la cookie.
      const usersRes = await fetch("/api/users");
      if (!usersRes.ok) {
        setError("No se pudo cargar la lista de usuarios. ¿Está configurada INGEST_API_KEY?");
        setCargando(false);
        return;
      }
      const data = await usersRes.json();
      setUsers(data.users ?? []);
    } catch {
      setError("Error de conexión.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function crearUsuario(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setError(null);
    try {
      const allowed = nuevoAllowed.trim().split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nuevoUser.trim(), password: nuevoPass, allowed, admin: nuevoAdmin }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Error al crear usuario.");
        return;
      }
      setNuevoUser("");
      setNuevoPass("");
      setNuevoAllowed("*");
      setNuevoAdmin(false);
      await fetchUsers();
    } catch {
      setError("Error de conexión.");
    } finally {
      setCreando(false);
    }
  }

  async function guardarEdicion(username: string) {
    setGuardando(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      if (editPass) patch.password = editPass;
      patch.allowed = editAllowed.trim().split(",").map((s) => s.trim()).filter(Boolean);
      patch.admin = editAdmin;

      const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Error al actualizar.");
        return;
      }
      setEditando(null);
      await fetchUsers();
    } catch {
      setError("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrarUsuario(username: string) {
    if (!confirm(`¿Borrar el usuario "${username}"?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Error al borrar.");
        return;
      }
      await fetchUsers();
    } catch {
      setError("Error de conexión.");
    }
  }

  function empezarEditar(u: UserView) {
    setEditando(u.username);
    setEditAllowed(u.allowed.join(", "));
    setEditAdmin(u.admin);
    setEditPass("");
  }

  if (cargando) {
    return <main><h1>Usuarios</h1><p className="vacio">Cargando…</p></main>;
  }

  return (
    <main>
      <p className="miga"><Link href="/">Dashboards</Link> / Usuarios</p>
      <h1>Usuarios</h1>

      {error && <p className="login-error" style={{ marginBottom: 16 }}>{error}</p>}

      {/* Crear usuario */}
      <div className="tarjeta" style={{ marginBottom: 28 }}>
        <h2 style={{ marginBottom: 16 }}>Crear usuario</h2>
        <form onSubmit={crearUsuario} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label className="login-campo" style={{ flex: 1, minWidth: 140 }}>
              <span>Usuario</span>
              <input type="text" value={nuevoUser} onChange={(e) => setNuevoUser(e.target.value)} required autoFocus />
            </label>
            <label className="login-campo" style={{ flex: 1, minWidth: 140 }}>
              <span>Contraseña</span>
              <input type="password" value={nuevoPass} onChange={(e) => setNuevoPass(e.target.value)} required minLength={4} />
            </label>
          </div>
          <label className="login-campo">
            <span>Dashboards permitidos</span>
            <input type="text" value={nuevoAllowed} onChange={(e) => setNuevoAllowed(e.target.value)} placeholder="* o opentransit/resumen, otro/proyecto" />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={nuevoAdmin} onChange={(e) => setNuevoAdmin(e.target.checked)} />
            <span style={{ fontSize: 13 }}>Administrador (puede gestionar usuarios y ver todo)</span>
          </label>
          <button type="submit" className="login-boton" disabled={creando} style={{ width: "auto", padding: "10px 24px" }}>
            {creando ? "Creando…" : "Crear"}
          </button>
        </form>
      </div>

      {/* Lista de usuarios */}
      <div className="tabla-envoltorio">
        <table style={{ minWidth: "auto" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Usuario</th>
              <th style={{ textAlign: "left" }}>Dashboards</th>
              <th>Admin</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              editando === u.username ? (
                <tr key={u.username}>
                  <td style={{ fontWeight: 600 }}>{u.username}</td>
                  <td>
                    <input
                      type="text"
                      value={editAllowed}
                      onChange={(e) => setEditAllowed(e.target.value)}
                      className="buscador"
                      style={{ width: "100%", minWidth: 200 }}
                    />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={editAdmin} onChange={(e) => setEditAdmin(e.target.checked)} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <input
                        type="password"
                        value={editPass}
                        onChange={(e) => setEditPass(e.target.value)}
                        className="buscador"
                        placeholder="Nueva clave"
                        style={{ width: 120 }}
                      />
                      <button className="login-boton" style={{ width: "auto", padding: "6px 14px", fontSize: 11 }} onClick={() => guardarEdicion(u.username)} disabled={guardando}>
                        {guardando ? "…" : "Guardar"}
                      </button>
                      <button className="salir" style={{ fontSize: 11, padding: "6px 14px" }} onClick={() => setEditando(null)}>
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={u.username}>
                  <td style={{ fontWeight: 600 }}>{u.username}</td>
                  <td style={{ fontSize: 12, color: "var(--muted-2)" }}>
                    {u.allowed.map((a) => <code key={a} style={{ marginRight: 6 }}>{a}</code>)}
                  </td>
                  <td style={{ textAlign: "center" }}>{u.admin ? "✓" : ""}</td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="salir" style={{ fontSize: 11, padding: "6px 14px" }} onClick={() => empezarEditar(u)}>
                        Editar
                      </button>
                      <button className="salir" style={{ fontSize: 11, padding: "6px 14px", borderColor: "var(--bad)", color: "var(--bad)" }} onClick={() => borrarUsuario(u.username)}>
                        Borrar
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="vacio">No hay usuarios creados todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
        Los dashboards permitidos usan el formato <code>usuario/proyecto</code>. Usá <code>*</code> para todo, o <code>opentransit/*</code> para todos los de un proyecto.
      </p>
    </main>
  );
}
