import { obtenerRIC56 } from "./protocolosConsultas.js";
import { generarProtocoloPDF } from "./protocoloPDF.js";

function esc(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fecha(valor) {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return esc(valor);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function estado(valor) {
  if (valor === "CONFORME") return '<span class="conforme">CONFORME</span>';
  if (valor === "NO CONFORME") return '<span class="no-conforme">NO CONFORME</span>';
  if (valor === "NO APLICA") return '<span class="na">NO APLICA</span>';
  return '<span class="na">-</span>';
}

function limpiarNombreArchivo(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function generarVerificaciones(datos) {
  const items = datos.verificaciones || [];
  return `
    <table class="tabla">
      <thead><tr><th style="width:7%">Nº</th><th>Parámetro</th><th style="width:24%">Resultado</th><th style="width:28%">Observaciones</th></tr></thead>
      <tbody>
        ${items.length ? items.map((item) => `
          <tr>
            <td>${esc(item.orden)}</td>
            <td>${esc(item.parametro)}</td>
            <td>${estado(item.estado)}</td>
            <td>${esc(item.observaciones || "")}</td>
          </tr>
        `).join("") : '<tr><td colspan="4" class="sin-datos">Sin datos registrados.</td></tr>'}
      </tbody>
    </table>
  `;
}

export async function generarRIC56PDF(ric56Id) {
  const datos = await obtenerRIC56(ric56Id);
  const descripcion = limpiarNombreArchivo(datos.descripcion || datos.descripcion_equipo);
  const numeroSerie = limpiarNombreArchivo(datos.numero_serie || datos.numero_serie_equipo);
  const fechaPDF = datos.fecha ? new Date(datos.fecha).toLocaleDateString("es-AR").replace(/\//g, "-") : "";
  const nombreArchivo = `RIC56_${descripcion}_${numeroSerie}_${ric56Id}_${fechaPDF}.pdf`;

  const variables = {
    CODIGO: "RIC56",
    TITULO: "VERIFICACIÓN DE EQUIPO RX MÓVIL",
    DESCRIPCION: esc(datos.descripcion || datos.descripcion_equipo || ""),
    MARCA_MODELO: esc(datos.marca_modelo || datos.marca_modelo_equipo || ""),
    SERIE: esc(datos.numero_serie || datos.numero_serie_equipo || ""),
    AREA: esc(datos.area || datos.area_equipo || ""),
    SERVICIO: esc(datos.servicio || datos.servicio_equipo || ""),
    SUB_SERVICIO: esc(datos.sub_servicio || datos.sub_servicio_equipo || ""),
    ENCARGADO: esc(datos.encargado || datos.encargado_equipo || ""),
    TECNICO: esc(datos.tecnico || ""),
    FECHA_MANTENIMIENTO: fecha(datos.fecha),
    EN_USO: datos.en_uso === true ? "Sí" : datos.en_uso === false ? "No" : "-",
    VERIFICACIONES: generarVerificaciones(datos),
    RESULTADO_GENERAL: esc(datos.resultado_general || ""),
    OBSERVACIONES: esc(datos.observaciones || "")
  };

  const pdf = await generarProtocoloPDF({
    plantilla: "ric56.html",
    variables,
    nombreArchivo,
    formato: "A4",
    orientacion: "portrait"
  });

  return { pdf, nombreArchivo };
}
