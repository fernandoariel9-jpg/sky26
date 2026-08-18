// ============================================================
// MOTOR COMÚN DE GENERACIÓN DE PDFs DE PROTOCOLOS
// Sky26 - Ingeniería Clínica
// ============================================================

import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// ============================================================
// CONFIGURACIÓN DE RUTAS
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// /pdf
const PDF_DIR = __dirname;

// raíz del proyecto
const ROOT_DIR = path.join(__dirname, "..");

// plantilla HTML común
const TEMPLATE_PATH = path.join(
  ROOT_DIR,
  "templates",
  "protocoloPDF.html"
);

// logo institucional
const LOGO_PATH = path.join(
  ROOT_DIR,
  "templates",
  "logo_app.png"
);


// ============================================================
// ESCAPAR HTML
// ============================================================

function escaparHTML(valor) {

  if (valor === null || valor === undefined) {
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
// FORMATO DE FECHA
// ============================================================

function formatearFecha(fecha) {

  if (!fecha) {
    return "";
  }

  const d = new Date(fecha);

  if (Number.isNaN(d.getTime())) {
    return String(fecha);
  }

  return d.toLocaleDateString(
    "es-AR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  );
}


// ============================================================
// LOGO EN BASE64
// ============================================================

async function obtenerLogoBase64() {

  const buffer = await fs.readFile(
    LOGO_PATH
  );

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
  variables = {}
) {

  let resultado = html;

  for (const [clave, valor] of Object.entries(variables)) {

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
// GENERAR HTML
// ============================================================

export async function generarHTMLProtocolo({

  codigo,
  titulo,
  subtitulo,
  contenido,
  variables = {}

}) {

  // ----------------------------------------------------------
  // CARGAR PLANTILLA
  // ----------------------------------------------------------

  let html =
    await fs.readFile(
      TEMPLATE_PATH,
      "utf8"
    );


  // ----------------------------------------------------------
  // LOGO
  // ----------------------------------------------------------

  const logo =
    await obtenerLogoBase64();


  // ----------------------------------------------------------
  // FECHA
  // ----------------------------------------------------------

  const fecha =
    formatearFecha(
      new Date()
    );


  // ----------------------------------------------------------
  // VARIABLES COMUNES
  // ----------------------------------------------------------

  const variablesComunes = {

    LOGO: logo,

    CODIGO:
      escaparHTML(codigo),

    TITULO:
      escaparHTML(titulo),

    SUBTITULO:
      escaparHTML(subtitulo),

    FECHA: fecha,

    CONTENIDO:
      contenido || "",

    HOSPITAL:
      "Hospital",

    VERSION:
      "1.0",

    ANIO:
      new Date().getFullYear()

  };


  // ----------------------------------------------------------
  // COMBINAR VARIABLES
  // ----------------------------------------------------------

  const todasLasVariables = {

    ...variablesComunes,

    ...variables

  };


  // ----------------------------------------------------------
  // REEMPLAZAR
  // ----------------------------------------------------------

  html =
    reemplazarVariables(
      html,
      todasLasVariables
    );


  return html;
}


// ============================================================
// GENERAR PDF
// ============================================================

export async function generarProtocoloPDF({

  codigo,
  titulo,
  subtitulo,
  contenido,
  variables = {}

}) {

  let browser = null;

  try {

    // --------------------------------------------------------
    // GENERAR HTML
    // --------------------------------------------------------

    const html =
      await generarHTMLProtocolo({

        codigo,
        titulo,
        subtitulo,
        contenido,
        variables

      });


    // --------------------------------------------------------
    // INICIAR PUPPETEER
    // --------------------------------------------------------

    browser =
      await puppeteer.launch({

        headless: true,

        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu"
        ]

      });


    // --------------------------------------------------------
    // CREAR PÁGINA
    // --------------------------------------------------------

    const page =
      await browser.newPage();


    // --------------------------------------------------------
    // CONFIGURAR TAMAÑO
    // --------------------------------------------------------

    await page.setViewport({

      width: 1200,

      height: 1600,

      deviceScaleFactor: 1

    });


    // --------------------------------------------------------
    // CARGAR HTML
    // --------------------------------------------------------

    await page.setContent(
      html,
      {
        waitUntil: [
          "load",
          "networkidle0"
        ]
      }
    );


    // --------------------------------------------------------
    // GENERAR PDF
    // --------------------------------------------------------

    const pdf =
      await page.pdf({

        format: "A4",

        printBackground: true,

        preferCSSPageSize: true,

        margin: {

          top: "15mm",

          right: "12mm",

          bottom: "15mm",

          left: "12mm"

        }

      });


    return pdf;

  } finally {

    // --------------------------------------------------------
    // CERRAR NAVEGADOR
    // --------------------------------------------------------

    if (browser) {

      await browser.close();

    }

  }

}


// ============================================================
// EXPORTAR FUNCIONES AUXILIARES
// ============================================================

export {
  escaparHTML,
  formatearFecha,
  reemplazarVariables
};
