// ============================================================
// MOTOR COMÚN DE PDFs DE PROTOCOLOS
// Sky26 - Ingeniería Clínica
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

// ============================================================
// CONFIGURACIÓN DE RUTAS
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carpeta raíz del proyecto
const ROOT_DIR = path.join(__dirname, "..");

// Carpeta de plantillas
const TEMPLATES_DIR = path.join(
  ROOT_DIR,
  "templates"
);

// Logo común
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
// CONVERTIR LOGO A BASE64
// ============================================================

function obtenerLogoBase64() {

  if (!fs.existsSync(LOGO_PATH)) {

    console.warn(
      "⚠️ No se encontró el logo:",
      LOGO_PATH
    );

    return "";
  }

  const buffer =
    fs.readFileSync(LOGO_PATH);

  return `data:image/png;base64,${buffer.toString("base64")}`;
}


// ============================================================
// FORMATEAR FECHA
// ============================================================

export function formatearFecha(
  fecha
) {

  if (!fecha) {
    return "";
  }

  const date =
    new Date(fecha);

  if (Number.isNaN(date.getTime())) {
    return String(fecha);
  }

  return date.toLocaleDateString(
    "es-AR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  );
}


// ============================================================
// FORMATEAR FECHA Y HORA
// ============================================================

export function formatearFechaHora(
  fecha
) {

  if (!fecha) {
    return "";
  }

  const date =
    new Date(fecha);

  if (Number.isNaN(date.getTime())) {
    return String(fecha);
  }

  return date.toLocaleString(
    "es-AR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


// ============================================================
// REEMPLAZAR VARIABLES
// ============================================================

export function reemplazarVariables(
  html,
  variables = {}
) {

  let resultado = html;

  for (
    const [clave, valor]
    of Object.entries(variables)
  ) {

    const marcador =
      `{{${clave}}}`;

    const valorHTML =
      valor === null ||
      valor === undefined
        ? ""
        : String(valor);

    resultado =
      resultado.split(marcador)
        .join(valorHTML);
  }

  return resultado;
}


// ============================================================
// CARGAR PLANTILLA
// ============================================================

export function cargarPlantilla(
  nombreArchivo
) {

  const ruta =
    path.join(
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
// GENERAR PDF
// ============================================================

export async function generarPDFProtocolo({

  plantilla,

  variables = {},

  nombreArchivo = "protocolo.pdf",

  formato = "A4",

  orientacion = "portrait"

}) {

  // ----------------------------------------------------------
  // 1. CARGAR HTML
  // ----------------------------------------------------------

  let html =
    cargarPlantilla(
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

    LOGO: logo,

    FECHA_EMISION:
      formatearFecha(
        new Date()
      ),

    FECHA:
      formatearFecha(
        new Date()
      ),

    ANIO:
      new Date()
        .getFullYear(),

    ...variables

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
  // 5. INICIAR PUPPETEER
  // ----------------------------------------------------------

  const browser =
    await puppeteer.launch({

      headless: true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]

    });


  try {

    const page =
      await browser.newPage();


    // --------------------------------------------------------
    // 6. CARGAR HTML
    // --------------------------------------------------------

    await page.setContent(
      html,
      {
        waitUntil: "networkidle0"
      }
    );


    // --------------------------------------------------------
    // 7. GENERAR PDF
    // --------------------------------------------------------

    const pdf =
      await page.pdf({

        format,

        landscape:
          orientacion === "landscape",

        printBackground: true,

        margin: {

          top: "15mm",
          bottom: "15mm",
          left: "12mm",
          right: "12mm"

        },

        displayHeaderFooter: false

      });


    return {

      pdf,

      nombreArchivo

    };


  } finally {

    await browser.close();

  }

}


// ============================================================
// GENERADOR SIMPLIFICADO
// ============================================================

export async function generarProtocoloPDF({

  plantilla,

  variables = {},

  nombreArchivo,

  formato = "A4",

  orientacion = "portrait"

}) {

  return generarPDFProtocolo({

    plantilla,

    variables,

    nombreArchivo,

    formato,

    orientacion

  });

}
