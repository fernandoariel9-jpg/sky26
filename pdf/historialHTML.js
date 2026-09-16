import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function formatearFecha(fecha) {
    if (!fecha) return "-";
    try {
        return new Date(fecha).toLocaleString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch {
        return fecha;
    }
}

function obtenerClase(tipo = "") {
    return tipo
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "");
}

function badgeEstado(estado = "") {
    const e = estado.toLowerCase();
    if (e.includes("activo")) return '<span class="estado-activo">ACTIVO</span>';
    if (e.includes("ingres")) return '<span class="estado-ingresado">INGRESADO</span>';
    if (e.includes("fuera")) return '<span class="estado-fuera">FUERA DE SERVICIO</span>';
    if (e.includes("baja")) return '<span class="estado-baja">DE BAJA</span>';
    if (e.includes("obsole")) return '<span class="estado-obsoleto">OBSOLETO</span>';
    return `<span class="estado-normal">${estado || "-"}</span>`;
}

function primeraIntervencion(historial) {
    if (!historial.length) return "-";
    return formatearFecha(historial[historial.length - 1].fecha);
}

function ultimaIntervencion(historial) {
    if (!historial.length) return "-";
    return formatearFecha(historial[0].fecha);
}

function generarRepuestos(consumos = []) {
    if (!Array.isArray(consumos) || consumos.length === 0) return "";

    const filas = consumos.map((c) => `
<tr>
<td>${c.codigo || "-"}</td>
<td>${c.descripcion || "-"}</td>
<td style="text-align:center;">${c.cantidad ?? "-"}</td>
<td>${c.unidad || "-"}</td>
<td>${c.personal_nombre || "-"}</td>
</tr>
`).join("");

    return `
<tr>
<th colspan="2">REPUESTOS UTILIZADOS</th>
</tr>
<tr>
<td colspan="2">
<table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:4px;">
<thead>
<tr>
<th style="border:1px solid #bbb; padding:4px;">Código</th>
<th style="border:1px solid #bbb; padding:4px;">Descripción</th>
<th style="border:1px solid #bbb; padding:4px;">Cant.</th>
<th style="border:1px solid #bbb; padding:4px;">Unidad</th>
<th style="border:1px solid #bbb; padding:4px;">Técnico</th>
</tr>
</thead>
<tbody>${filas}</tbody>
</table>
</td>
</tr>
`;
}

function generarHistorial(historial = []) {
    if (!historial.length) {
        return `<div class="sinHistorial">No existen intervenciones registradas para este equipo.</div>`;
    }

    return historial.map((item) => {
        const tipo = item.tipo_mantenimiento || "Mantenimiento";
        const clase = obtenerClase(tipo);
        const estado = item.fin
            ? '<span class="estado-finalizado">FINALIZADO</span>'
            : '<span class="estado-curso">EN CURSO</span>';

        return `
<table class="tablaIntervencion ${clase}">
<tr class="cabeceraIntervencion">
<td colspan="2">
<div class="cabeceraFlex">
<div class="tipo">${tipo}</div>
<div>${estado}</div>
<div>${formatearFecha(item.fecha)}</div>
</div>
</td>
</tr>
<tr><td class="tituloCampo">Técnico</td><td>${item.asignado || "-"}</td></tr>
<tr><td class="tituloCampo">Solicitado por</td><td>${item.solicitado_por || item.usuario || "-"}</td></tr>
<tr><td class="tituloCampo">Fecha de Finalización</td><td>${formatearFecha(item.fecha_fin)}</td></tr>
<tr><th colspan="2">DIAGNÓSTICO</th></tr>
<tr><td colspan="2" class="texto">${item.diagnostico || "Sin diagnóstico registrado."}</td></tr>
<tr><th colspan="2">SOLUCIÓN</th></tr>
<tr><td colspan="2" class="texto">${item.solucion || "Sin solución registrada."}</td></tr>
${generarRepuestos(item.consumos)}
${item.observacion ? `
<tr><th colspan="2">OBSERVACIONES</th></tr>
<tr><td colspan="2" class="texto">${item.observacion}</td></tr>
` : ""}
</table>
`;
    }).join("\n");
}

export async function generarHTML(datos) {
    const templatePath = path.join(__dirname, "../templates/historialEquipo.html");
    let html = fs.readFileSync(templatePath, "utf8");

    const cssPath = path.join(__dirname, "../templates/historialEquipo.css");
    const css = fs.readFileSync(cssPath, "utf8");
    html = html.replace("</head>", `<style>${css}</style></head>`);

    const logoPath = path.join(__dirname, "../templates/logo_app.png");
    if (fs.existsSync(logoPath)) {
        const logo = fs.readFileSync(logoPath).toString("base64");
        html = html.replaceAll("{{LOGO}}", `data:image/png;base64,${logo}`);
    } else {
        html = html.replaceAll("{{LOGO}}", "");
    }

    const variables = {
        HOSPITAL: "Hospital P. D. Dr. Guillermo Rawson",
        FECHA: formatearFecha(new Date()),
        DESCRIPCION: datos.equipo.descripcion ?? "-",
        MARCA: datos.equipo.marca_modelo ?? "-",
        SERIE: datos.equipo.numero_serie ?? "-",
        SERVICIO: datos.equipo.servicio ?? "-",
        AREA: datos.equipo.area ?? "-",
        ESTADO: badgeEstado(datos.equipo.estado),
        ULTIMO: formatearFecha(datos.equipo.ultimo_mant),
        TOTAL: datos.resumen.total ?? 0,
        CORRECTIVOS: datos.resumen.correctivos ?? 0,
        PREVENTIVOS: datos.resumen.preventivos ?? 0,
        CALIBRACIONES: datos.resumen.calibraciones ?? 0,
        INSTALACIONES: datos.resumen.instalaciones ?? 0,
        PRIMER_MANTENIMIENTO: datos.resumen.primer_mantenimiento
            ? formatearFecha(datos.resumen.primer_mantenimiento)
            : primeraIntervencion(datos.historial),
        ULTIMA_INTERVENCION: datos.resumen.ultima_intervencion
            ? formatearFecha(datos.resumen.ultima_intervencion)
            : ultimaIntervencion(datos.historial),
        PROMEDIO_REPARACION: datos.resumen.promedio_reparacion_dias ?? "-",
        DIAS_FUERA_SERVICIO: datos.resumen.dias_fuera_servicio ?? 0,
        VERSION: "1.0",
        ANIO: new Date().getFullYear()
    };

    for (const [clave, valor] of Object.entries(variables)) {
        html = html.replaceAll(`{{${clave}}}`, valor);
    }

    if (datos.equipo.imagen) {
        html = html.replace(
            "{{IMAGEN_EQUIPO}}",
            `<img src="${datos.equipo.imagen}" style="width:100%;height:100%;object-fit:contain;" />`
        );
    } else {
        html = html.replace(
            "{{IMAGEN_EQUIPO}}",
            `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#777;font-size:12px;">Imágen no disponible</div>`
        );
    }

    html = html.replace("{{HISTORIAL}}", generarHistorial(datos.historial));

    if (html.includes("{{IMAGEN_EQUIPO}}")) {
        html = html.replaceAll("{{IMAGEN_EQUIPO}}", "");
    }

    if (html.includes("{{QR}}")) {
        html = html.replaceAll("{{QR}}", "");
    }

    return html;
}
