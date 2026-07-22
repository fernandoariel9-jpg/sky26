import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import pool from "../db.js";

// -----------------------------------------------------
// Compatibilidad con ES Modules
// -----------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -----------------------------------------------------
// Funciones auxiliares
// -----------------------------------------------------

function formatearFecha(fecha) {
  if (!fecha) return "-";

  try {
    return new Date(fecha).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return fecha;
  }
}

function generarHistorial(historial) {
  return historial
    .map((item) => {
      const clase = (item.tipo_mantenimiento || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      return `
      <div class="evento ${clase}">
        <h3>
          ${item.fin ? "✅" : "🟡"}
          ${item.tipo_mantenimiento || "-"}
        </h3>

        <p><b>Fecha:</b> ${formatearFecha(item.fecha)}</p>
        <p><b>Solicitado por:</b> ${item.solicitado_por || "-"}</p>
        <p><b>Técnico:</b> ${item.asignado || "-"}</p>

        <p><b>Diagnóstico</b></p>
        <p>${item.diagnostico || "-"}</p>

        <p><b>Solución</b></p>
        <p>${item.solucion || "-"}</p>

        ${
          item.observacion
            ? `
        <p><b>Observaciones</b></p>
        <p>${item.observacion}</p>
        `
            : ""
        }
      </div>
      `;
    })
    .join("");
}

// -----------------------------------------------------
// Obtiene toda la información del equipo
// -----------------------------------------------------

async function obtenerDatosEquipo(numeroSerie) {
  // Equipo
  const equipoResult = await pool.query(
    `
    SELECT
      id,
      descripcion,
      marca_modelo,
      numero_serie,
      estado,
      servicio,
      area,
      sub_servicio,
      ultimo_mant
    FROM equipos
    WHERE numero_serie = $1
    `,
    [numeroSerie]
  );

  if (equipoResult.rows.length === 0) {
    throw new Error("Equipo no encontrado");
  }

  const equipo = equipoResult.rows[0];

  // Historial completo
  const historialResult = await pool.query(
    `
    SELECT
      id,
      fecha,
      fecha_comp,
      fecha_fin,
      tipo_mantenimiento,
      diagnostico,
      solucion,
      observacion,
      usuario,
      asignado,
      solicitado_por,
      fin
    FROM ric01
    WHERE numero_serie = $1
    ORDER BY fecha DESC
    `,
    [numeroSerie]
  );

  // Resumen
  const resumenResult = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,

      SUM(
        CASE
          WHEN tipo_mantenimiento='Correctivo'
          THEN 1 ELSE 0
        END
      )::int AS correctivos,

      SUM(
        CASE
          WHEN tipo_mantenimiento='Preventivo'
          THEN 1 ELSE 0
        END
      )::int AS preventivos,

      SUM(
        CASE
          WHEN tipo_mantenimiento='Calibración'
          THEN 1 ELSE 0
        END
      )::int AS calibraciones,

      SUM(
        CASE
          WHEN tipo_mantenimiento='Instalación'
          THEN 1 ELSE 0
        END
      )::int AS instalaciones

    FROM ric01
    WHERE numero_serie = $1
    `,
    [numeroSerie]
  );

  return {
    equipo,
    historial: historialResult.rows,
    resumen: resumenResult.rows[0],
  };
}
// -----------------------------------------------------
// Genera el HTML del informe
// -----------------------------------------------------

async function generarHTML(datos) {
  const templatePath = path.join(
    __dirname,
    "../templates/historialEquipo.html"
  );

  let html = fs.readFileSync(templatePath, "utf8");

  // ---------- Logo ----------
  const logoPath = path.resolve(
    __dirname,
    "../public/logo.png"
  );

  if (fs.existsSync(logoPath)) {
    const logoBase64 = fs.readFileSync(logoPath).toString("base64");

    html = html.replace(
      "{{LOGO}}",
      `data:image/png;base64,${logoBase64}`
    );
  } else {
    html = html.replace("{{LOGO}}", "");
  }

  // ---------- Resumen ----------
  const resumen = `
    <table class="tabla-resumen">
      <tr>
        <td><b>Total intervenciones</b></td>
        <td>${datos.resumen.total || 0}</td>
      </tr>

      <tr>
        <td>Correctivos</td>
        <td>${datos.resumen.correctivos || 0}</td>
      </tr>

      <tr>
        <td>Preventivos</td>
        <td>${datos.resumen.preventivos || 0}</td>
      </tr>

      <tr>
        <td>Calibraciones</td>
        <td>${datos.resumen.calibraciones || 0}</td>
      </tr>

      <tr>
        <td>Instalaciones</td>
        <td>${datos.resumen.instalaciones || 0}</td>
      </tr>
    </table>
  `;

  // ---------- Datos generales ----------

  html = html.replace("{{HOSPITAL}}", "HOSPITAL XXXXX");

  html = html.replace(
    "{{DESCRIPCION}}",
    datos.equipo.descripcion || "-"
  );

  html = html.replace(
    "{{MARCA}}",
    datos.equipo.marca_modelo || "-"
  );

  html = html.replace(
    "{{SERIE}}",
    datos.equipo.numero_serie || "-"
  );

  html = html.replace(
    "{{SERVICIO}}",
    datos.equipo.servicio || "-"
  );

  html = html.replace(
    "{{AREA}}",
    datos.equipo.area || "-"
  );

  html = html.replace(
    "{{ESTADO}}",
    datos.equipo.estado || "-"
  );

  html = html.replace(
    "{{ULTIMO}}",
    formatearFecha(datos.equipo.ultimo_mant)
  );

  html = html.replace(
    "{{RESUMEN}}",
    resumen
  );

  html = html.replace(
    "{{HISTORIAL}}",
    generarHistorial(datos.historial)
  );

  html = html.replace(
    "{{FECHA}}",
    formatearFecha(new Date())
  );

  return html;
}
// -----------------------------------------------------
// Genera el PDF
// -----------------------------------------------------

async function generarPDF(req, res) {
  let browser = null;

  try {
    const { serie } = req.params;

    // Obtener datos del equipo
    const datos = await obtenerDatosEquipo(serie);

    // Generar HTML
    const html = await generarHTML(datos);

    // Lanzar Chromium
browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
  args: chromium.args,
  defaultViewport: chromium.defaultViewport
});

    const page = await browser.newPage();

    await page.setViewport({
      width: 1240,
      height: 1754
    });

    await page.setContent(html, {
      waitUntil: "networkidle0"
    });

    await page.emulateMediaType("screen");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: {
        top: "15mm",
        right: "12mm",
        bottom: "15mm",
        left: "12mm"
      }
    });

    await browser.close();
    browser = null;

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      `inline; filename="Historial_${serie}.pdf"`
    );

    res.end(pdf);

  } catch (error) {

    console.error("Error generando PDF:", error);

    if (browser) {
      try {
        await browser.close();
      } catch {}
    }

    res.status(500).json({
      error: error.message
    });
  }
}
// -----------------------------------------------------
// Exportación
// -----------------------------------------------------

export default generarPDF;
