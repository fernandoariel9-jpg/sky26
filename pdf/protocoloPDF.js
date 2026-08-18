import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ============================================================
 * MOTOR COMÚN DE PDF PARA PROTOCOLOS RIC
 * ============================================================
 *
 * Este archivo NO conoce RIC29, RIC30, RIC31, etc.
 *
 * Recibe un objeto con:
 *
 * {
 *   codigo,
 *   titulo,
 *   subtitulo,
 *   institucion,
 *   equipo,
 *   mantenimiento,
 *   secciones,
 *   observaciones,
 *   firmas
 * }
 *
 * y devuelve un Buffer PDF generado con Puppeteer.
 * ============================================================
 */

export async function generarProtocoloPDF(datos = {}) {

  const html = generarHTML(datos);

  const browser = await puppeteer.launch({
    headless: true,

    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {

    const page = await browser.newPage();

    await page.setViewport({
      width: 1240,
      height: 1754,
      deviceScaleFactor: 1,
    });

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    const pdf = await page.pdf({

      format: "A4",

      printBackground: true,

      preferCSSPageSize: false,

      margin: {
        top: "18mm",
        bottom: "20mm",
        left: "15mm",
        right: "15mm",
      },

      displayHeaderFooter: true,

      headerTemplate: `
        <div style="
          width: 100%;
          height: 10mm;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 8px;
          color: #555;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding-right: 15mm;
        ">
        </div>
      `,

      footerTemplate: `
        <div style="
          width: 100%;
          height: 10mm;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 8px;
          color: #555;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-left: 15mm;
          padding-right: 15mm;
        ">

          <span>
            Protocolo de mantenimiento
          </span>

          <span>
            Página
            <span class="pageNumber"></span>
            de
            <span class="totalPages"></span>
          </span>

        </div>
      `,
    });

    return pdf;

  } finally {

    await browser.close();

  }
}


/**
 * ============================================================
 * GENERACIÓN DEL HTML
 * ============================================================
 */

function generarHTML(datos = {}) {

  const {

    codigo = "",

    titulo = "PROTOCOLO DE MANTENIMIENTO",

    subtitulo = "",

    institucion = {
      nombre: "",
      dependencia: "",
    },

    equipo = {},

    mantenimiento = {},

    secciones = [],

    observaciones = "",

    firmas = {},

  } = datos;


  const logo = obtenerLogo();


  return `

<!DOCTYPE html>

<html lang="es">

<head>

<meta charset="UTF-8">

<title>${escapeHTML(titulo)}</title>


<style>

/* ============================================================
   CONFIGURACIÓN GENERAL
   ============================================================ */

* {
  box-sizing: border-box;
}

html,
body {

  margin: 0;
  padding: 0;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  font-size: 10px;

  color: #222;

  background: white;
}

body {
  padding: 0;
}

.documento {
  width: 100%;
}


/* ============================================================
   ENCABEZADO PRINCIPAL
   ============================================================ */

.encabezado {

  width: 100%;

  border: 1px solid #222;

  margin-bottom: 12px;

  page-break-inside: avoid;
}


.encabezado-superior {

  display: flex;

  width: 100%;

  min-height: 82px;
}


/* LOGO */

.encabezado-logo {

  width: 22%;

  border-right: 1px solid #222;

  display: flex;

  align-items: center;

  justify-content: center;

  padding: 8px;
}

.encabezado-logo img {

  max-width: 120px;

  max-height: 60px;

  object-fit: contain;
}


/* CENTRO */

.encabezado-centro {

  width: 58%;

  display: flex;

  flex-direction: column;

  justify-content: center;

  align-items: center;

  text-align: center;

  padding: 8px;
}

.encabezado-centro .institucion {

  font-size: 11px;

  font-weight: bold;

  margin-bottom: 5px;
}

.encabezado-centro .dependencia {

  font-size: 9px;

  margin-bottom: 8px;
}

.encabezado-centro .titulo {

  font-size: 15px;

  font-weight: bold;

  line-height: 1.2;
}

.encabezado-centro .subtitulo {

  margin-top: 5px;

  font-size: 9px;
}


/* CÓDIGO */

.encabezado-codigo {

  width: 20%;

  border-left: 1px solid #222;

  display: flex;

  flex-direction: column;

  align-items: center;

  justify-content: center;

  text-align: center;

  padding: 8px;
}

.codigo-label {

  font-size: 8px;

  margin-bottom: 5px;

  color: #555;
}

.codigo-valor {

  font-size: 16px;

  font-weight: bold;
}


/* ============================================================
   SECCIONES
   ============================================================ */

.seccion {

  width: 100%;

  margin-bottom: 12px;

  page-break-inside: avoid;
}

.seccion-titulo {

  width: 100%;

  padding: 6px 8px;

  border: 1px solid #222;

  background: #e9e9e9;

  font-size: 11px;

  font-weight: bold;

  text-transform: uppercase;
}


/* ============================================================
   TABLAS
   ============================================================ */

.tabla {

  width: 100%;

  border-collapse: collapse;

  border-spacing: 0;
}

.tabla th,
.tabla td {

  border: 1px solid #222;

  padding: 5px 6px;

  vertical-align: middle;

  line-height: 1.3;
}

.tabla th {

  background: #f2f2f2;

  font-weight: bold;

  text-align: center;
}


/* ============================================================
   DATOS DEL EQUIPO
   ============================================================ */

.dato-label {

  width: 18%;

  font-weight: bold;

  background: #f7f7f7;
}

.dato-valor {

  width: 32%;
}


/* ============================================================
   TABLAS DE PROTOCOLO
   ============================================================ */

.protocolo-tabla {

  page-break-inside: auto;
}

.protocolo-tabla tr {

  page-break-inside: avoid;

  page-break-after: auto;
}

.protocolo-tabla th {

  text-align: center;

  vertical-align: middle;
}


/* ============================================================
   RESULTADOS
   ============================================================ */

.resultado {

  text-align: center;

  font-weight: bold;
}

.resultado-ok {

  font-weight: bold;
}

.resultado-no {

  font-weight: bold;
}


/* ============================================================
   OBSERVACIONES
   ============================================================ */

.observaciones {

  min-height: 70px;

  padding: 8px;

  white-space: pre-wrap;

  line-height: 1.4;
}


/* ============================================================
   FIRMAS
   ============================================================ */

.firmas {

  width: 100%;

  margin-top: 40px;

  page-break-inside: avoid;
}

.firma {

  width: 50%;

  text-align: center;

  vertical-align: bottom;

  padding: 10px;
}

.firma-linea {

  width: 80%;

  margin: 0 auto 7px auto;

  border-top: 1px solid #222;

  height: 1px;
}

.firma-nombre {

  font-weight: bold;

  margin-bottom: 3px;
}

.firma-cargo {

  font-size: 9px;
}


/* ============================================================
   UTILIDADES
   ============================================================ */

.texto-centro {
  text-align: center;
}

.texto-izquierda {
  text-align: left;
}

.texto-derecha {
  text-align: right;
}

.negrita {
  font-weight: bold;
}

.salto-pagina {
  page-break-before: always;
}


/* ============================================================
   IMPRESIÓN
   ============================================================ */

@page {

  size: A4;

  margin: 18mm 15mm 20mm 15mm;
}

</style>

</head>


<body>


<div class="documento">


  <!-- ========================================================
       ENCABEZADO
       ======================================================== -->

  <div class="encabezado">

    <div class="encabezado-superior">


      <!-- LOGO -->

      <div class="encabezado-logo">

        ${
          logo
            ? `<img src="${logo}" alt="Logo">`
            : `<strong>LOGO</strong>`
        }

      </div>


      <!-- INFORMACIÓN CENTRAL -->

      <div class="encabezado-centro">

        ${
          institucion.nombre
            ? `
              <div class="institucion">
                ${escapeHTML(institucion.nombre)}
              </div>
            `
            : ""
        }


        ${
          institucion.dependencia
            ? `
              <div class="dependencia">
                ${escapeHTML(institucion.dependencia)}
              </div>
            `
            : ""
        }


        <div class="titulo">

          ${escapeHTML(titulo)}

        </div>


        ${
          subtitulo
            ? `
              <div class="subtitulo">
                ${escapeHTML(subtitulo)}
              </div>
            `
            : ""
        }

      </div>


      <!-- CÓDIGO -->

      <div class="encabezado-codigo">

        <div class="codigo-label">
          PROTOCOLO
        </div>

        <div class="codigo-valor">

          ${escapeHTML(codigo)}

        </div>

      </div>


    </div>

  </div>



  <!-- ========================================================
       DATOS DEL EQUIPO
       ======================================================== -->

  <div class="seccion">

    <div class="seccion-titulo">

      Datos del equipo

    </div>


    <table class="tabla">


      <tr>

        <td class="dato-label">
          Descripción
        </td>

        <td class="dato-valor">
          ${escapeHTML(equipo.descripcion)}
        </td>


        <td class="dato-label">
          Marca / Modelo
        </td>

        <td class="dato-valor">
          ${escapeHTML(equipo.marca_modelo)}
        </td>

      </tr>


      <tr>

        <td class="dato-label">
          Número de serie
        </td>

        <td class="dato-valor">
          ${escapeHTML(equipo.numero_serie)}
        </td>


        <td class="dato-label">
          Estado
        </td>

        <td class="dato-valor">
          ${escapeHTML(equipo.estado)}
        </td>

      </tr>


      <tr>

        <td class="dato-label">
          Servicio
        </td>

        <td class="dato-valor">
          ${escapeHTML(equipo.servicio)}
        </td>


        <td class="dato-label">
          Área
        </td>

        <td class="dato-valor">
          ${escapeHTML(equipo.area)}
        </td>

      </tr>


      ${
        equipo.sub_servicio !== undefined
          ? `
            <tr>

              <td class="dato-label">
                Subservicio
              </td>

              <td class="dato-valor">
                ${escapeHTML(equipo.sub_servicio)}
              </td>

              <td class="dato-label">
                Último mantenimiento
              </td>

              <td class="dato-valor">
                ${escapeHTML(equipo.ultimo_mant)}
              </td>

            </tr>
          `
          : ""
      }


    </table>

  </div>



  <!-- ========================================================
       DATOS DEL MANTENIMIENTO
       ======================================================== -->

  <div class="seccion">

    <div class="seccion-titulo">

      Datos del mantenimiento

    </div>


    <table class="tabla">


      <tr>

        <td class="dato-label">
          Tipo de mantenimiento
        </td>

        <td class="dato-valor">
          ${escapeHTML(mantenimiento.tipo_mantenimiento)}
        </td>


        <td class="dato-label">
          Fecha de inicio
        </td>

        <td class="dato-valor">
          ${escapeHTML(mantenimiento.fecha)}
        </td>

      </tr>


      <tr>

        <td class="dato-label">
          Técnico
        </td>

        <td class="dato-valor">
          ${escapeHTML(mantenimiento.usuario)}
        </td>


        <td class="dato-label">
          Fecha de finalización
        </td>

        <td class="dato-valor">
          ${escapeHTML(mantenimiento.fecha_fin)}
        </td>

      </tr>


      ${
        mantenimiento.diagnostico
          ? `
            <tr>

              <td class="dato-label">
                Diagnóstico
              </td>

              <td colspan="3">

                ${escapeHTML(mantenimiento.diagnostico)}

              </td>

            </tr>
          `
          : ""
      }


      ${
        mantenimiento.solucion
          ? `
            <tr>

              <td class="dato-label">
                Solución
              </td>

              <td colspan="3">

                ${escapeHTML(mantenimiento.solucion)}

              </td>

            </tr>
          `
          : ""
      }


    </table>

  </div>



  <!-- ========================================================
       SECCIONES DEL PROTOCOLO
       ======================================================== -->

  ${generarSecciones(secciones)}



  <!-- ========================================================
       OBSERVACIONES GENERALES
       ======================================================== -->

  ${
    observaciones
      ? `

        <div class="seccion">

          <div class="seccion-titulo">

            Observaciones generales

          </div>


          <table class="tabla">

            <tr>

              <td class="observaciones">

                ${escapeHTML(observaciones)}

              </td>

            </tr>

          </table>

        </div>

      `
      : ""
  }



  <!-- ========================================================
       FIRMAS
       ======================================================== -->

  <table class="firmas">

    <tr>


      <td class="firma">

        <div class="firma-linea"></div>

        ${
          firmas.tecnico?.nombre
            ? `
              <div class="firma-nombre">
                ${escapeHTML(firmas.tecnico.nombre)}
              </div>
            `
            : ""
        }

        <div class="firma-cargo">

          ${
            firmas.tecnico?.cargo
              ? escapeHTML(firmas.tecnico.cargo)
              : "Técnico responsable"
          }

        </div>

      </td>


      <td class="firma">

        <div class="firma-linea"></div>

        ${
          firmas.responsable?.nombre
            ? `
              <div class="firma-nombre">
                ${escapeHTML(firmas.responsable.nombre)}
              </div>
            `
            : ""
        }

        <div class="firma-cargo">

          ${
            firmas.responsable?.cargo
              ? escapeHTML(firmas.responsable.cargo)
              : "Responsable del servicio"
          }

        </div>

      </td>


    </tr>

  </table>


</div>


</body>

</html>

`;

}


/**
 * ============================================================
 * GENERACIÓN DE SECCIONES
 * ============================================================
 *
 * Cada protocolo puede enviar sus propias secciones.
 *
 * Ejemplo:
 *
 * {
 *   titulo: "Inspección visual",
 *
 *   columnas: [
 *      "Ítem",
 *      "Verificación",
 *      "Resultado",
 *      "Observaciones"
 *   ],
 *
 *   filas: [
 *      {
 *        numero: 1,
 *        descripcion: "Estado general del equipo",
 *        resultado: "OK",
 *        observacion: ""
 *      }
 *   ]
 * }
 *
 * ============================================================
 */

function generarSecciones(secciones = []) {

  if (!Array.isArray(secciones) || secciones.length === 0) {
    return "";
  }


  return secciones
    .map((seccion) => {

      const columnas = Array.isArray(seccion.columnas)
        ? seccion.columnas
        : [];


      const filas = Array.isArray(seccion.filas)
        ? seccion.filas
        : [];


      const saltoPagina = seccion.saltoPagina
        ? "salto-pagina"
        : "";


      return `

        <div class="seccion ${saltoPagina}">


          <div class="seccion-titulo">

            ${escapeHTML(
              seccion.titulo || "Sección del protocolo"
            )}

          </div>


          <table class="tabla protocolo-tabla">


            ${
              columnas.length
                ? `

                  <thead>

                    <tr>

                      ${columnas
                        .map(
                          (columna) => `

                            <th>

                              ${escapeHTML(columna)}

                            </th>

                          `
                        )
                        .join("")}

                    </tr>

                  </thead>

                `
                : ""
            }


            <tbody>


              ${
                filas.length
                  ? filas
                      .map((fila) => {

                        /*
                         * FILA COMO ARRAY
                         *
                         * [
                         *   "1",
                         *   "Verificar...",
                         *   "OK",
                         *   ""
                         * ]
                         */

                        if (Array.isArray(fila)) {

                          return `

                            <tr>

                              ${fila
                                .map(
                                  (valor) => `

                                    <td>

                                      ${escapeHTML(valor)}

                                    </td>

                                  `
                                )
                                .join("")}

                            </tr>

                          `;
                        }


                        /*
                         * FILA COMO OBJETO
                         */

                        return `

                          <tr>

                            <td class="texto-centro">

                              ${escapeHTML(fila.numero)}

                            </td>


                            <td>

                              ${escapeHTML(
                                fila.descripcion
                              )}

                            </td>


                            <td class="resultado">

                              ${escapeHTML(
                                fila.resultado
                              )}

                            </td>


                            <td>

                              ${escapeHTML(
                                fila.observacion
                              )}

                            </td>

                          </tr>

                        `;

                      })
                      .join("")

                  : `

                      <tr>

                        <td
                          colspan="${Math.max(
                            columnas.length,
                            1
                          )}"
                          class="texto-centro"
                        >

                          Sin registros

                        </td>

                      </tr>

                    `
              }


            </tbody>


          </table>


        </div>

      `;

    })
    .join("");
}


/**
 * ============================================================
 * LOGO
 * ============================================================
 */

function obtenerLogo() {

  const posiblesRutas = [

    path.join(__dirname, "../public/logo.png"),

    path.join(__dirname, "../public/logo.jpg"),

    path.join(__dirname, "../public/logo.jpeg"),

  ];


  for (const ruta of posiblesRutas) {

    if (fs.existsSync(ruta)) {

      const extension = path
        .extname(ruta)
        .toLowerCase();


      let mime = "image/png";


      if (extension === ".jpg" || extension === ".jpeg") {
        mime = "image/jpeg";
      }


      const base64 = fs
        .readFileSync(ruta)
        .toString("base64");


      return `data:${mime};base64,${base64}`;
    }

  }


  return "";
}


/**
 * ============================================================
 * ESCAPE HTML
 * ============================================================
 */

function escapeHTML(valor) {

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


/**
 * ============================================================
 * EXPORTACIONES
 * ============================================================
 */

export {
  generarHTML,
  generarSecciones,
  escapeHTML,
};
