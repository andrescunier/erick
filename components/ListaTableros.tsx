import Link from "next/link";
import { fichaDe } from "@/lib/catalogo";

/**
 * Índice de tableros. Lista plana y no agrupada por usuario: "leandro" es quien
 * publica el archivo, no un tema, y agrupar por eso obliga a saber de antemano
 * quién publica qué para encontrar un tablero.
 */
export function ListaTableros({ tableros }: { tableros: { user: string; project: string }[] }) {
  return (
    <ul className="lista-tableros">
      {tableros.map(({ user, project }) => {
        const ficha = fichaDe(user, project);
        return (
          <li key={`${user}/${project}`}>
            <Link href={`/${user}/${project}`}>
              <span className="tablero-nombre">{ficha.nombre}</span>
              <span className="tablero-descripcion">{ficha.descripcion}</span>
              <span className="tablero-pie">
                <span className="tablero-destacado">{ficha.destacado}</span>
                <code>
                  {user}/{project}
                </code>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
