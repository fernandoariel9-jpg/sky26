import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import pool from "../db.js"; // <-- ajusta la ruta si tu pool está en otro archivo
import { fileURLToPath } from "url";
import { dirname } from "path";

async function obtenerDatosEquipo(numeroSerie) {
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
function formatearFecha(fecha) {

    if (!fecha) return "-";

    return new Date(fecha).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}
function generarHistorial(historial) {
    return historial.map(item => {
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
<p><b>Fecha:</b>${formatearFecha(item.fecha)}</p>
<p><b>Solicitado por:</b>${item.solicitado_por || "-"}</p>
<p><b>Técnico:</b>${item.asignado || "-"}</p>
<p><b>Diagnóstico</b></p><p>${item.diagnostico || "-"}</p>
<p><b>Solución</b></p><p>${item.solucion || "-"}</p>
${item.observacion?`
<p><b>Observaciones</b></p><p>${item.observacion}</p>`
:
""
}
</div>
`;
    }).join("");
}
async function generarHTML(datos) {
    const templatePath = path.join(
        __dirname,
        "../templates/historialEquipo.html"
    );
    let html = fs.readFileSync(
        templatePath,
        "utf8"
    );

    const resumen = `

<table>
<tr>
<td>Total intervenciones</td>
<td>${datos.resumen.total}</td>
</tr>
<tr>
<td>Correctivos</td>
<td>${datos.resumen.correctivos}</td>
</tr>
<tr>
<td>Preventivos</td>
<td>${datos.resumen.preventivos}</td>
</tr>
<tr>
<td>Calibraciones</td>
<td>${datos.resumen.calibraciones}</td>
</tr>
<tr>
<td>Instalaciones</td>
<td>${datos.resumen.instalaciones}</td>
</tr>
</table>
`;

    const logoPath = path.resolve(__dirname, "../public/logo.png");
    html = html.replace("{{LOGO}}",`file://${logoPath}`);
    html = html.replace("{{HOSPITAL}}","HOSPITAL XXXXX");
    html = html.replace("{{DESCRIPCION}}",datos.equipo.descripcion || "-");
    html = html.replace("{{MARCA}}",datos.equipo.marca_modelo || "-");
    html = html.replace("{{SERIE}}",datos.equipo.numero_serie || "-");
    html = html.replace("{{SERVICIO}}",datos.equipo.servicio || "-");
    html = html.replace("{{AREA}}",datos.equipo.area || "-");
    html = html.replace("{{ESTADO}}",datos.equipo.estado || "-");
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
    return html;
}
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
            solicitado_por
            fin
        FROM ric01
        WHERE numero_serie = $1
        ORDER BY fecha DESC
        `,
        [numeroSerie]
    );
    const resumenResult = await pool.query(
        `
        SELECT
            COUNT(*) total,
            SUM(
                CASE
                WHEN tipo_mantenimiento='Correctivo'
                THEN 1
                ELSE 0
                END
            ) correctivos,
            SUM(
                CASE
                WHEN tipo_mantenimiento='Preventivo'
                THEN 1
                ELSE 0
                END
            ) preventivos,
            SUM(
                CASE
                WHEN tipo_mantenimiento='Calibración'
                THEN 1
                ELSE 0
                END
            ) calibraciones,
            SUM(
                CASE
                WHEN tipo_mantenimiento='Instalación'
                THEN 1
                ELSE 0
                END
            ) instalaciones
        FROM ric01
        WHERE numero_serie=$1
        `,
        [numeroSerie]
    );
    return {
        equipo,
        historial: historialResult.rows,
        resumen: resumenResult.rows[0]
    };
}
async function generarPDF(req, res) {
    try {
        const { serie } = req.params;
        const datos = await obtenerDatosEquipo(serie);
        const html = await generarHTML(datos);
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox"
            ]
        });
        const page = await browser.newPage();
        await page.setContent(html, {
            waitUntil: "networkidle0"
        });
        await page.emulateMediaType("screen");
        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "20mm",
                bottom: "20mm",
                left: "15mm",
                right: "15mm"
            }
        });
        await browser.close();
        res.setHeader(
            "Content-Type",
            "application/pdf"
        );
        res.setHeader(
            "Content-Disposition",
            `inline; filename=Historial_${serie}.pdf`
        );
        res.send(pdf);
    }
    catch (error) {
        console.error("Error generando PDF:", error);
        res.status(500).json({
            error: error.message
        });
    }
}
export default generarPDF;
