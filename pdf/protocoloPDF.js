// ============================================================
// MOTOR COMÚN DE PDF PARA PROTOCOLOS RIC
// protocoloPDF.js
// ============================================================

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { fileURLToPath } from "url";


// ============================================================
// RUTAS
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// /pdf/protocoloPDF.js
// /templates/ric29.html
// /templates/logo_app.png

const TEMPLATES_DIR = path.join(
  __dirname,
  "..",
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
// OBTENER LOGO BASE64
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
// LEER PLANTILLA HTML
// ============================================================

function obtenerPlantilla(nombrePlantilla) {

  if (!nombrePlantilla) {

    throw new Error(
      "No se indicó la plantilla HTML del protocolo."
    );

  }

  const rutaPlantilla =
    path.join(
      TEMPLATES_DIR,
      nombrePlantilla
    );

  if (!fs.existsSync(rutaPlantilla)) {

    throw new Error(
      `No se encontró la plantilla: ${rutaPlantilla}`
    );

  }

  return fs.readFileSync(
    rutaPlantilla,
    "utf8"
  );
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
  // 1. LEER PLANTILLA
  // ----------------------------------------------------------

  let html =
    obtenerPlantilla(
      plantilla
    );


  // ----------------------------------------------------------
  // 2. LOGO
  // ----------------------------------------------------------

  const logo =
    obtenerLogoBase64();


  // ----------------------------------------------------------
  // 3. VARIABLES GENERALES
  // ----------------------------------------------------------

  const variablesCompletas = {

    ...variables,

    LOGO:
      logo,

    ANIO:
      new Date().getFullYear(),

    VERSION:
      variables.VERSION || "1.0"

  };


  // ----------------------------------------------------------
  // 4. REEMPLAZAR VARIABLES
  // ----------------------------------------------------------

  html =
    reemplazarVariables(
      html,
      variablesCompletas
    );

// ----------------------------------------------------------
// PUPPETEER / CHROMIUM
// ----------------------------------------------------------

const browser = await puppeteer.launch({

  executablePath:
    await chromium.executablePath(),

  headless:
    chromium.headless,

  args:
    chromium.args,

  defaultViewport:
    chromium.defaultViewport

});


try {

  const page =
    await browser.newPage();


  // --------------------------------------------------------
  // VIEWPORT
  // --------------------------------------------------------

  await page.setViewport({
    width: 1240,
    height: 1754
  });


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


  await page.emulateMediaType(
    "screen"
  );


  // --------------------------------------------------------
  // ORIENTACIÓN
  // --------------------------------------------------------

  const landscape =
    orientacion === "landscape";


  // --------------------------------------------------------
  // GENERAR PDF
  // --------------------------------------------------------

  const pdf =
    await page.pdf({

      format,

      landscape,

      printBackground:
        true,

      preferCSSPageSize:
        true,

      displayHeaderFooter:
        false,

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
