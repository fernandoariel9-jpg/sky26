// ============================================================
// MOTOR COMÚN DE PDF PARA PROTOCOLOS RIC
// protocoloPDF.js
// ============================================================

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";


// ============================================================
// CONFIGURACIÓN GENERAL
// ============================================================

const __dirname = path.resolve();

const LOGO_PATH = path.join(
  __dirname,
  "templates",
  "logo_app.png"
);


// ============================================================
// FORMATEAR FECHA
// ============================================================

function formatearFecha(fecha) {

  if (!fecha) {
    return "";
  }

  const d = new Date(fecha);

  if (isNaN(d.getTime())) {
    return fecha;
  }

  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}


// ============================================================
// ESCAPAR HTML
// ============================================================

function escaparHTML(valor) {

  if (
    valor === null ||
    valor === undefined
  ) {
    return "";
  }

  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ============================================================
// LOGO
// ============================================================

function obtenerLogoBase64() {

  if (!fs.existsSync(LOGO_PATH)) {

    console.warn(
      "⚠️ No se encontró el logo:",
      LOGO_PATH
    );

    return "";
  }

  const imagen =
    fs.readFileSync(LOGO_PATH);

  return `data:image/png;base64,${imagen.toString("base64")}`;
}


// ============================================================
// REEMPLAZAR VARIABLES
// ============================================================

function reemplazarVariables(
  html,
  variables = {}
) {

  let resultado = html;

  for (
    const [clave, valor] of Object.entries(variables)
  ) {

    const marcador =
      `{{${clave}}}`;

    resultado =
      resultado.split(marcador).join(
        valor ?? ""
      );

  }

  return resultado;
}


// ============================================================
// GENERAR HTML DEL ENCABEZADO
// ============================================================

function generarEncabezado({
  codigo,
  titulo,
  subtitulo,
  cabecera
}) {

  const logo =
    obtenerLogoBase64();

  return `
<div class="protocolo-header">

  <table class="header-table">

    <tr>

      <td class="header-logo">
        ${
          logo
            ? `<img src="${logo}" class="logo">`
            : ""
        }
      </td>

      <td class="header-info">

        <div class="hospital">
          Servicio de Ingeniería Clínica
        </div>

        <div class="titulo">
          ${escaparHTML(titulo)}
        </div>

        <div class="subtitulo">
          ${escaparHTML(subtitulo)}
        </div>

        <div class="fecha">
          Fecha:
          <b>
            ${formatearFecha(cabecera?.fecha)}
          </b>
        </div>

      </td>

      <td class="header-codigo">

        <div class="codigo">
          ${escaparHTML(codigo)}
        </div>

        <div class="codigo-texto">
          Protocolo
        </div>

      </td>

    </tr>

  </table>

</div>
`;
}


// ============================================================
// DATOS DEL EQUIPO
// ============================================================

function generarDatosEquipo(cabecera) {

  return `
<div class="ficha">

  <div class="ficha-titulo">
    DATOS DEL EQUIPO
  </div>

  <table class="datos-equipo">

    <tr>
      <td>Equipo</td>
      <td>
        ${escaparHTML(cabecera?.descripcion || "")}
      </td>
    </tr>

    <tr>
      <td>Marca / Modelo</td>
      <td>
        ${escaparHTML(cabecera?.marca_modelo)}
      </td>
    </tr>

    <tr>
      <td>Número de Serie</td>
      <td>
        ${escaparHTML(cabecera?.numero_serie)}
      </td>
    </tr>

    <tr>
      <td>Servicio</td>
      <td>
        ${escaparHTML(cabecera?.servicio)}
      </td>
    </tr>

    <tr>
      <td>Área</td>
      <td>
        ${escaparHTML(cabecera?.area)}
      </td>
    </tr>

    <tr>
      <td>Subservicio</td>
      <td>
        ${escaparHTML(cabecera?.sub_servicio)}
      </td>
    </tr>

    <tr>
      <td>Técnico</td>
      <td>
        ${escaparHTML(cabecera?.tecnico)}
      </td>
    </tr>

    <tr>
      <td>Resultado general</td>
      <td>
        <b>
          ${escaparHTML(cabecera?.resultado_general)}
        </b>
      </td>
    </tr>

  </table>

</div>
`;
}


// ============================================================
// ESTILOS COMUNES
// ============================================================

function generarCSS() {

  return `
<style>

@page {
  size: A4;
  margin: 15mm;
}

* {
  box-sizing: border-box;
}

body {

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  font-size: 10pt;

  color: #222;

  margin: 0;

  padding: 0;
}

table {

  width: 100%;

  border-collapse: collapse;
}

.protocolo-header {

  border: 1.5px solid #000;

  margin-bottom: 15px;
}

.header-table td {

  padding: 8px;

  vertical-align: middle;
}

.header-logo {

  width: 22%;

  text-align: center;
}

.logo {

  max-width: 110px;

  max-height: 70px;
}

.header-info {

  width: 58%;

  text-align: center;
}

.hospital {

  font-size: 10pt;

  font-weight: bold;

  margin-bottom: 5px;
}

.titulo {

  font-size: 16pt;

  font-weight: bold;

  text-transform: uppercase;
}

.subtitulo {

  font-size: 12pt;

  margin-top: 3px;
}

.fecha {

  margin-top: 8px;

  font-size: 9pt;
}

.header-codigo {

  width: 20%;

  text-align: center;

  border-left: 1.5px solid #000;
}

.codigo {

  font-size: 20pt;

  font-weight: bold;
}

.codigo-texto {

  font-size: 8pt;

  color: #666;

  margin-top: 5px;
}

.ficha {

  border: 1px solid #000;

  margin-bottom: 15px;
}

.ficha-titulo {

  background: #e5e7eb;

  border-bottom: 1px solid #000;

  font-weight: bold;

  padding: 7px;

  font-size: 10pt;
}

.datos-equipo td {

  border: 1px solid #ccc;

  padding: 6px;
}

.datos-equipo td:first-child {

  width: 25%;

  font-weight: bold;

  background: #f5f5f5;
}

.seccion {

  margin-top: 15px;

  margin-bottom: 15px;

  page-break-inside: avoid;
}

.seccion-titulo {

  background: #e5e7eb;

  border: 1px solid #000;

  padding: 7px;

  font-size: 11pt;

  font-weight: bold;
}

.tabla {

  margin-top: 5px;

  width: 100%;

  border-collapse: collapse;
}

.tabla th {

  background: #f3f4f6;

  font-weight: bold;
}

.tabla th,
.tabla td {

  border: 1px solid #777;

  padding: 5px;

  text-align: center;
}

.conforme {

  color: #15803d;

  font-weight: bold;
}

.no-conforme {

  color: #dc2626;

  font-weight: bold;
}

.observaciones {

  border: 1px solid #999;

  padding: 8px;

  margin-top: 5px;

  white-space: pre-wrap;
}

.resultado-general {

  margin-top: 20px;

  padding: 12px;

  border: 2px solid #000;

  text-align: center;

  font-size: 14pt;

  font-weight: bold;
}

.footer {

  margin-top: 25px;

  padding-top: 8px;

  border-top: 1px solid #999;

  font-size: 8pt;

  color: #666;
}

</style>
`;
}


// ============================================================
// GENERAR PDF
// ============================================================

export async function generarProtocoloPDF({

  codigo,

  titulo,

  subtitulo,

  datos,

  generarContenido,

  hospital = "Sky26",

  version = "1.0"

}) {

  if (!datos) {

    throw new Error(
      "No se recibieron datos para generar el PDF."
    );

  }

  // ----------------------------------------------------------
  // ENCABEZADO
  // ----------------------------------------------------------

  const encabezado =
    generarEncabezado({
      codigo,
      titulo,
      subtitulo,
      cabecera: datos.cabecera
    });


  // ----------------------------------------------------------
  // DATOS EQUIPO
  // ----------------------------------------------------------

  const equipo =
    generarDatosEquipo(
      datos.cabecera
    );


  // ----------------------------------------------------------
  // CONTENIDO ESPECÍFICO DEL PROTOCOLO
  // ----------------------------------------------------------

  const contenido =
    typeof generarContenido === "function"
      ? generarContenido(datos)
      : "";


  // ----------------------------------------------------------
  // HTML COMPLETO
  // ----------------------------------------------------------

  const html = `

<!DOCTYPE html>

<html lang="es">

<head>

<meta charset="UTF-8">

<title>
${escaparHTML(codigo)}
</title>

${generarCSS()}

</head>

<body>

${encabezado}

${equipo}

${contenido}

<div class="footer">

<table>

<tr>

<td>
<b>${escaparHTML(hospital)}</b><br>
Sistema de Gestión de Ingeniería Clínica
</td>

<td style="text-align:center;">
Documento generado automáticamente
</td>

<td style="text-align:right;">
Versión ${escaparHTML(version)}<br>
© ${new Date().getFullYear()}
</td>

</tr>

</table>

</div>

</body>

</html>
`;


  // ----------------------------------------------------------
  // PUPPETEER
  // ----------------------------------------------------------

  const browser =
    await puppeteer.launch({

      headless: true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ]

    });


  try {

    const page =
      await browser.newPage();


    await page.setContent(
      html,
      {
        waitUntil: "networkidle0"
      }
    );


    const pdf =
      await page.pdf({

        format: "A4",

        printBackground: true,

        margin: {

          top: "15mm",

          right: "15mm",

          bottom: "15mm",

          left: "15mm"

        }

      });


    return pdf;


  } finally {

    await browser.close();

  }

}
