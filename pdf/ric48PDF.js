import { obtenerRIC48 } from "./protocolosConsultas.js";
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
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function estado(conforme, noAplica = false) {
  if (noAplica) return '<span class="na">N/A</span>';
  if (conforme === true) return '<span class="conforme">CONFORME</span>';
  if (conforme === false) return '<span class="no-conforme">NO CONFORME</span>';
  return '<span class="na">-</span>';
}

function generarInspecciones(datos) {
  const item = datos.inspecciones?.[0];
  if (!item) return '<p class="sin-datos">Sin datos registrados.</p>';

  const filas = [
    ["Limpieza exterior", item.limpieza_exterior],
    ["Papel de registro", item.papel_registro],
    ["Estado de cables", item.estado_cables]
  ];

  return `
    <table class="tabla">
      <thead><tr><th>Inspección previa</th><th>Resultado</th></tr></thead>
      <tbody>
        ${filas.map(([nombre, valor]) => `
          <tr><td>${esc(nombre)}</td><td>${esc(valor || "-")}</td></tr>
        `).join("")}
      </tbody>
    </table>
    ${item.observaciones ? `<div class="observaciones"><b>Observaciones:</b> ${esc(item.observaciones)}</div>` : ""}
  `;
}

function generarMediciones(datos) {
  const grupos = [
    "FRECUENCIA",
    "AMPLITUD",
    "GRUPO DE ONDA",
    "ARTEFACTOS",
    "FORMA DE ONDA",
    "SEGMENTO ST"
  ];

  return grupos.map((grupo) => {
    const items = (datos.mediciones || []).filter((x) => x.grupo === grupo);

    return `
      <div class="escenario">
        <div class="escenario-titulo">${esc(grupo)}</div>
        <table class="tabla tabla-mediciones">
          <thead>
            <tr>
              <th>Parámetro</th>
              <th>Valor nominal</th>
              <th>Medición / Resultado</th>
              <th>Rango de aceptación</th>
              <th>Incertidumbre</th>
              <th>Valoración</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map((item) => `
              <tr>
                <td>${esc(item.parametro)}</td>
                <td>${esc(item.valor_nominal || "-")}</td>
                <td>${esc(item.medicion || "-")}</td>
                <td>${esc(item.rango_aceptacion || "-")}</td>
                <td>${esc(item.incertidumbre || "-")}</td>
                <td>${estado(item.conforme, item.no_aplica)}</td>
              </tr>
            `).join("") : `<tr><td colspan="6" class="sin-datos">Sin datos registrados.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }).join("");
}

function generarVerificador(datos) {
  return `
    <table class="tabla tabla-verificador">
      <tbody>
        <tr>
          <td><b>Equipo verificador</b></td>
          <td>${esc(datos.verificador_equipo || "")}</td>
          <td><b>Nº Serie</b></td>
          <td>${esc(datos.verificador_numero_serie || "")}</td>
        </tr>
        <tr>
          <td><b>ETYC</b></td>
          <td>${fecha(datos.verificador_etyc)}</td>
          <td><b>Vigencia</b></td>
          <td>${fecha(datos.verificador_vigencia)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function generarSeguridadElectrica(datos) {
  const ric37 = datos.ric37;
  if (!ric37) {
    return '<p class="sin-datos">No se vinculó un ensayo de seguridad eléctrica RIC37.</p>';
  }

  const determinaciones = datos.ric37_determinaciones || [];

  return `
    <table class="tabla tabla-seguridad">
      <tbody>
        <tr>
          <td><b>Clase</b></td><td>${esc(ric37.clase || "-")}</td>
          <td><b>Tipo de protección</b></td><td>${esc(ric37.tipo_proteccion || "-")}</td>
          <td><b>Tensión</b></td><td>${esc(ric37.medicion_tension || "-")}</td>
          <td><b>Corriente</b></td><td>${esc(ric37.medicion_corriente || "-")}</td>
        </tr>
      </tbody>
    </table>
    <table class="tabla tabla-seguridad">
      <thead>
        <tr>
          <th>Determinación</th>
          <th>Valor</th>
          <th>R. aceptación</th>
          <th>Apto / No Apto</th>
        </tr>
      </thead>
      <tbody>
        ${determinaciones.map((item) => `
          <tr>
            <td>${esc(item.nombre || item.determinacion || "")}</td>
            <td>${esc(item.medicion ?? "-")}</td>
            <td>${esc(item.rango_aceptacion ?? "-")}</td>
            <td>${estado(item.conforme, item.no_aplica)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${ric37.observaciones ? `<div class="observaciones"><b>Observaciones RIC37:</b> ${esc(ric37.observaciones)}</div>` : ""}
  `;
}

function limpiarNombreArchivo(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function generarRIC48PDF(ric48_id) {
  const datos = await obtenerRIC48(ric48_id);

  const descripcion = limpiarNombreArchivo(datos.descripcion || datos.descripcion_equipo);
  const numeroSerie = limpiarNombreArchivo(datos.numero_serie || datos.numero_serie_equipo);
  const fechaPDF = datos.fecha
    ? new Date(datos.fecha).toLocaleDateString("es-AR").replace(/\//g, "-")
    : "";

  const nombreArchivo = `RIC48_${descripcion}_${numeroSerie}_${ric48_id}_${fechaPDF}.pdf`;

  const variables = {
    CODIGO: "RIC48",
    TITULO: "VERIFICACIÓN DE ELECTROCARDIÓGRAFO",
    DESCRIPCION: esc(datos.descripcion || datos.descripcion_equipo || ""),
    MARCA_MODELO: esc(datos.marca_modelo || datos.marca_modelo_equipo || ""),
    SERIE: esc(datos.numero_serie || datos.numero_serie_equipo || ""),
    AREA: esc(datos.area || datos.area_equipo || ""),
    SERVICIO: esc(datos.servicio || datos.servicio_equipo || ""),
    SUB_SERVICIO: esc(datos.sub_servicio || datos.sub_servicio_equipo || ""),
    ENCARGADO: esc(datos.encargado || datos.encargado_equipo || ""),
    TECNICO: esc(datos.tecnico || ""),
    FECHA_MANTENIMIENTO: fecha(datos.fecha),
    INSPECCIONES: generarInspecciones(datos),
    MEDICIONES: generarMediciones(datos),
    VERIFICADOR: generarVerificador(datos),
    SEGURIDAD_ELECTRICA: generarSeguridadElectrica(datos),
    RESULTADO_GENERAL: esc(datos.resultado_general || ""),
    OBSERVACIONES: esc(datos.observaciones || "")
  };

  const pdf = await generarProtocoloPDF({
    plantilla: "ric48.html",
    variables,
    nombreArchivo,
    formato: "A4",
    orientacion: "portrait"
  });

  return { pdf, nombreArchivo };
}
