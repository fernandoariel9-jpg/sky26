// ============================================================
// MOTOR COMÚN DE PDF PARA PROTOCOLOS RIC
// protocoloPDF.js
// ============================================================

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";


// ============================================================
// RUTA BASE
// ============================================================

const BASE_DIR = process.cwd();


// ============================================================
// RUTAS
// ============================================================

const TEMPLATES_DIR = path.join(
  BASE_DIR,
  "templates"
);

const LOGO_PATH = path.join(
  TEMPLATES_DIR,
  "logo_app.png"
);


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
// CARGAR PLANTILLA
// ============================================================

function cargarPlantilla(nombreArchivo) {

  const ruta = path.join(
    TEMPLATES_DIR,
    nombreArchivo
  );

  if (!fs.existsSync(ruta)) {

    throw new Error(
      `No existe la plantilla PDF: ${ruta}`
    );

  }

  return fs.readFileSync(
    ruta,
    "utf8"
  );
}


// ============================================================
// LOGO
// ============================================================

function obtenerLogo() {

  if (!fs.existsSync(LOGO_PATH)) {

    throw new Error(
      `No existe el logo: ${LOGO_PATH}`
    );

  }

  const buffer =
    fs.readFileSync(LOGO_PATH);

  return (
    "data:image/png;base64," +
    buffer.toString("base64")
  );
}


// ============================================================
// REEMPLAZAR VARIABLES
// ============================================================

function reemplazarVariables(
  html,
  variables
) {

  let resultado = html;

  for (
    const [clave, valor]
    of Object.entries(variables || {})
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
// CSS COMÚN
// ============================================================

function obtenerCSS() {

  return `

<style>

@page {

  size: A4;

  margin:
    12mm
    12mm
    15mm
    12mm;
}


* {

  box-sizing:
    border-box;

}


body {

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  font-size:
    9pt;

  color:
    #222;

  margin:
    0;

  padding:
    0;

}


table {

  width:
    100%;

  border-collapse:
    collapse;

}


.header {

  width:
    100%;

  border:
    1.5px solid #000;

  margin-bottom:
    12px;

}


.header td {

  vertical-align:
    middle;

}


.logo {

  max-width:
    105px;

  max-height:
    70px;

}


.tituloHospital {

  font-size:
    12pt;

  font-weight:
    bold;

}


.subtitulo {

  font-size:
    10pt;

}


.codigo {

  font-size:
    18pt;

  font-weight:
    bold;

}


.ficha {

  border:
    1px solid #000;

  margin-bottom:
    12px;

}


.fichaTitulo {

  background:
    #e5e7eb;

  border-bottom:
    1px solid #000;

  padding:
    6px;

  font-weight:
    bold;

}


.ficha table td {

  border:
    1px solid #ccc;

  padding:
    5px;

}


.ficha table td:first-child {

  font-weight:
    bold;

  background:
    #f5f5f5;

}


.resumenTitulo {

  background:
    #e5e7eb;

  border:
    1px solid #000;

  padding:
    6px;

  margin-top:
    12px;

  margin-bottom:
    5px;

  font-weight:
    bold;

}


.tabla {

  width:
    100%;

  border-collapse:
    collapse;

  margin-bottom:
    8px;

}


.tabla th,
.tabla td {

  border:
    1px solid #777;

  padding:
    5px;

}


.tabla th {

  background:
    #f3f4f6;

  font-weight:
    bold;

  text-align:
    center;

}


.tabla td {

  vertical-align:
    middle;

}


.conforme {

  color:
    #15803d;

  font-weight:
    bold;

}


.no-conforme {

  color:
    #dc2626;

  font-weight:
    bold;

}


.na {

  color:
    #666;

  font-weight:
    bold;

}


.observaciones {

  border:
    1px solid #999;

  padding:
    7px;

  margin-top:
    5px;

  white-space:
    pre-wrap;

}


.seccion {

  page-break-inside:
    avoid;

  margin-bottom:
    10px;

}


.footer {

  margin-top:
    20px;

  padding-top:
    8px;

  border-top:
    1px solid #999;

  font-size:
    8pt;

  color:
    #666;

}


</style>

`;

}


// ============================================================
// GENERAR PDF
// ============================================================

export async function generarProtocoloPDF({

  plantilla,

  variables = {},

  nombreArchivo,

  formato = "A4",

  orientacion = "portrait"

}) {

  // ----------------------------------------------------------
  // VALIDACIONES
  // ----------------------------------------------------------

  if (!plantilla) {

    throw new Error(
      "No se indicó la plantilla del protocolo."
    );

  }


  // ----------------------------------------------------------
  // CARGAR HTML
  // ----------------------------------------------------------

  let html =
    cargarPlantilla(
      plantilla
    );


  // ----------------------------------------------------------
  // LOGO
  // ----------------------------------------------------------

  const logo =
    obtenerLogo();


  // ----------------------------------------------------------
  // VARIABLES COMUNES
  // ----------------------------------------------------------

  const variablesFinales = {

    LOGO:
      logo,

    HOSPITAL:
      variables.HOSPITAL ||
      "Sky26",

    FECHA:
      variables.FECHA ||
      variables.FECHA_MANTENIMIENTO ||
      "",

    VERSION:
      variables.VERSION ||
      "1.0",

    ANIO:
      new Date()
        .getFullYear(),

    ...variables

  };


  // ----------------------------------------------------------
  // REEMPLAZAR VARIABLES
  // ----------------------------------------------------------

  html =
    reemplazarVariables(
      html,
      variablesFinales
    );


  // ----------------------------------------------------------
  // AGREGAR CSS
  // ----------------------------------------------------------

  html =
    html.replace(
      "</head>",
      `${obtenerCSS()}</head>`
    );


  // ----------------------------------------------------------
  // PUPPETEER
  // ----------------------------------------------------------

  const browser =
    await puppeteer.launch({

      headless:
        true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ]

    });


  try {

    const page =
      await browser.newPage();


    // --------------------------------------------------------
    // CARGAR HTML
    // --------------------------------------------------------

    await page.setContent(
      html,
      {
        waitUntil:
          "networkidle0"
      }
    );


    // --------------------------------------------------------
    // CONFIGURACIÓN
    // --------------------------------------------------------

    const landscape =
      orientacion ===
      "landscape";


    // --------------------------------------------------------
    // GENERAR PDF
    // --------------------------------------------------------

    const pdf =
      await page.pdf({

        format,

        landscape,

        printBackground:
          true,

        margin: {

          top:
            "12mm",

          right:
            "12mm",

          bottom:
            "15mm",

          left:
            "12mm"

        }

      });


    return pdf;


  } finally {

    await browser.close();

  }

}
