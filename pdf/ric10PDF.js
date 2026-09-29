import pool from "../db.js";
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

export async function obtenerRIC10(id) {
  const idNumerico = Number(id);
  if (!Number.isInteger(idNumerico)) throw new Error(`ID RIC10 inválido: ${id}`);

  const { rows } = await pool.query(`
    SELECT
      r.*,
      e.estado,
      e.descripcion AS descripcion_equipo,
      e.marca_modelo AS marca_modelo_equipo,
      e.numero_serie AS numero_serie_equipo,
      e.area AS area_equipo,
      e.servicio AS servicio_equipo,
      e.sub_servicio AS sub_servicio_equipo,
      e.encargado AS encargado_equipo
    FROM ric10 r
    LEFT JOIN equipos e ON e.id = r.equipo_id
    WHERE r.id = $1
  `, [idNumerico]);

  if (!rows.length) throw new Error(`RIC10 no encontrado para id=${idNumerico}`);

  const verificaciones = await pool.query(`
    SELECT * FROM ric10_verificaciones WHERE ric10_id = $1 ORDER BY orden, id
  `, [idNumerico]);

  const mediciones = await pool.query(`
    SELECT * FROM ric10_mediciones WHERE ric10_id = $1 ORDER BY orden, id
  `, [idNumerico]);

  return { ...rows[0], verificaciones: verificaciones.rows, mediciones: mediciones.rows };
}

function generarVerificaciones(datos) {
  const items = datos.verificaciones || [];
  return `
    <table class="tabla">
      <thead><tr><th style="width:7%">Nº</th><th>Verificación</th><th style="width:22%">Resultado</th><th style="width:28%">Observaciones</th></tr></thead>
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

function generarMediciones(datos) {
  const items = datos.mediciones || [];
  return `
    <table class="tabla tabla-mediciones">
      <thead><tr><th style="width:7%">Nº</th><th>Parámetro</th><th>Referencia</th><th>Valor medido</th><th>Resultado</th></tr></thead>
      <tbody>
        ${items.length ? items.map((item) => `
          <tr>
            <td>${esc(item.orden)}</td>
            <td>${esc(item.parametro)}</td>
            <td>${esc(item.referencia)}</td>
            <td>${esc(item.valor || "-")} ${esc(item.unidad || "")}</td>
            <td>${estado(item.estado)}</td>
          </tr>
        `).join("") : '<tr><td colspan="5" class="sin-datos">Sin datos registrados.</td></tr>'}
      </tbody>
    </table>
  `;
}

function generarVerificador(datos) {
  return `
    <table class="tabla tabla-verificador">
      <tbody>
        <tr>
          <td><b>Equipo verificador</b></td><td>${esc(datos.verificador_equipo || "")}</td>
          <td><b>Nº Serie</b></td><td>${esc(datos.verificador_numero_serie || "")}</td>
        </tr>
        <tr>
          <td><b>Certificado</b></td><td>${esc(datos.verificador_certificado || "")}</td>
          <td><b>Vigencia</b></td><td>${fecha(datos.verificador_vigencia)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

export async function generarRIC10PDF(ric10Id) {
  const datos = await obtenerRIC10(ric10Id);
  const descripcion = limpiarNombreArchivo(datos.descripcion || datos.descripcion_equipo);
  const numeroSerie = limpiarNombreArchivo(datos.numero_serie || datos.numero_serie_equipo);
  const fechaPDF = datos.fecha ? new Date(datos.fecha).toLocaleDateString("es-AR").replace(/\//g, "-") : "";
  const nombreArchivo = `RIC10_${descripcion}_${numeroSerie}_${ric10Id}_${fechaPDF}.pdf`;

  const variables = {
    CODIGO: "RIC10",
    TITULO: "PLANILLA DE MP MAQUINA DE HEMODIALISIS",
    DESCRIPCION: esc(datos.descripcion || datos.descripcion_equipo || ""),
    MARCA_MODELO: esc(datos.marca_modelo || datos.marca_modelo_equipo || ""),
    SERIE: esc(datos.numero_serie || datos.numero_serie_equipo || ""),
    AREA: esc(datos.area || datos.area_equipo || ""),
    SERVICIO: esc(datos.servicio || datos.servicio_equipo || ""),
    SUB_SERVICIO: esc(datos.sub_servicio || datos.sub_servicio_equipo || ""),
    ENCARGADO: esc(datos.encargado || datos.encargado_equipo || ""),
    TECNICO: esc(datos.tecnico || ""),
    FECHA_MANTENIMIENTO: fecha(datos.fecha),
    VERIFICACIONES: generarVerificaciones(datos),
    MEDICIONES: generarMediciones(datos),
    VERIFICADOR: generarVerificador(datos),
    RESULTADO_GENERAL: esc(datos.resultado_general || ""),
    OBSERVACIONES: esc(datos.observaciones || "")
  };

  const pdf = await generarProtocoloPDF({
    plantilla: "ric10.html",
    variables,
    nombreArchivo,
    formato: "A4",
    orientacion: "portrait"
  });

  return { pdf, nombreArchivo };
}
