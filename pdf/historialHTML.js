import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ======================================================
// Formatea fechas
// ======================================================

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

// ======================================================
// Devuelve la clase CSS según el tipo
// ======================================================

function obtenerClase(tipo = "") {

    return tipo
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "");

}

// ======================================================
// Badge de estado
// ======================================================

function badgeEstado(estado = "") {

    const e = estado.toLowerCase();

    if (e.includes("activo"))
        return '<span class="estado-activo">ACTIVO</span>';

    if (e.includes("ingres"))
        return '<span class="estado-ingresado">INGRESADO</span>';

    if (e.includes("fuera"))
        return '<span class="estado-fuera">FUERA DE SERVICIO</span>';

    if (e.includes("baja"))
        return '<span class="estado-baja">DE BAJA</span>';

    if (e.includes("obsole"))
        return '<span class="estado-obsoleto">OBSOLETO</span>';

    return `<span class="estado-normal">${estado || "-"}</span>`;

}

// ======================================================
// Obtiene primera intervención
// ======================================================

function primeraIntervencion(historial) {

    if (!historial.length)
        return "-";

    return formatearFecha(
        historial[historial.length - 1].fecha
    );

}

// ======================================================
// Obtiene última intervención
// ======================================================

function ultimaIntervencion(historial) {

    if (!historial.length)
        return "-";

    return formatearFecha(
        historial[0].fecha
    );

}

// ======================================================
// Genera el historial de intervenciones
// ======================================================

function generarHistorial(historial = []) {

    if (!historial.length) {

        return `

<div class="sinHistorial">

No existen intervenciones registradas para este equipo.

</div>

`;

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

<div class="tipo">

${tipo}

</div>

<div>

${estado}

</div>

<div>

${formatearFecha(item.fecha)}

</div>

</div>

</td>

</tr>

<tr>

<td class="tituloCampo">

Técnico

</td>

<td>

${item.asignado || "-"}

</td>

</tr>

<tr>

<td class="tituloCampo">

Solicitado por

</td>

<td>

${item.solicitado_por || item.usuario || "-"}

</td>

</tr>

<tr>

<td class="tituloCampo">

Fecha de Finalización

</td>

<td>

${formatearFecha(item.fecha_fin)}

</td>

</tr>

<tr>

<th colspan="2">

DIAGNÓSTICO

</th>

</tr>

<tr>

<td colspan="2" class="texto">

${item.diagnostico || "Sin diagnóstico registrado."}

</td>

</tr>

<tr>

<th colspan="2">

SOLUCIÓN

</th>

</tr>

<tr>

<td colspan="2" class="texto">

${item.solucion || "Sin solución registrada."}

</td>

</tr>

${
item.observacion
?

`

<tr>

<th colspan="2">

OBSERVACIONES

</th>

</tr>

<tr>

<td colspan="2" class="texto">

${item.observacion}

</td>

</tr>

`

:

""

}

</table>

`;

    }).join("\n");

}

// ======================================================
// Genera el HTML completo
// ======================================================

export async function generarHTML(datos) {

    // --------------------------------------------
    // Template HTML
    // --------------------------------------------

    const templatePath = path.join(
        __dirname,
        "../templates/historialEquipo.html"
    );

    let html = fs.readFileSync(
        templatePath,
        "utf8"
    );

    // --------------------------------------------
    // CSS
    // --------------------------------------------

    const cssPath = path.join(
        __dirname,
        "../templates/historialEquipo.css"
    );

    const css = fs.readFileSync(
        cssPath,
        "utf8"
    );

    html = html.replace(
        "</head>",
        `<style>${css}</style></head>`
    );

    // --------------------------------------------
    // Logo
    // --------------------------------------------

    const logoPath = path.join(
        __dirname,
        "../templates/logosmall_old.png"
    );

    if (fs.existsSync(logoPath)) {

        const logo = fs
            .readFileSync(logoPath)
            .toString("base64");

        html = html.replaceAll(

            "{{LOGO}}",

            `data:image/png;base64,${logo}`

        );

    }
    else{

        html = html.replaceAll(
            "{{LOGO}}",
            ""
        );

    }

    // --------------------------------------------
    // Variables del informe
    // --------------------------------------------

    const variables = {

        HOSPITAL:
            "Hospital P. D. Dr. Guillermo Rawson",

        FECHA:
            formatearFecha(new Date()),

        DESCRIPCION:
            datos.equipo.descripcion ?? "-",

        MARCA:
            datos.equipo.marca_modelo ?? "-",

        SERIE:
            datos.equipo.numero_serie ?? "-",

        SERVICIO:
            datos.equipo.servicio ?? "-",

        AREA:
            datos.equipo.area ?? "-",

        ESTADO:
            badgeEstado(datos.equipo.estado),

        ULTIMO:
            formatearFecha(datos.equipo.ultimo_mant),

        TOTAL:
            datos.resumen.total ?? 0,

        CORRECTIVOS:
            datos.resumen.correctivos ?? 0,

        PREVENTIVOS:
            datos.resumen.preventivos ?? 0,

        CALIBRACIONES:
            datos.resumen.calibraciones ?? 0,

        INSTALACIONES:
            datos.resumen.instalaciones ?? 0,

        PRIMER_MANTENIMIENTO:
            datos.resumen.primer_mantenimiento
                ? formatearFecha(datos.resumen.primer_mantenimiento)
                : primeraIntervencion(datos.historial),

        ULTIMA_INTERVENCION:
            datos.resumen.ultima_intervencion
                ? formatearFecha(datos.resumen.ultima_intervencion)
                : ultimaIntervencion(datos.historial),

        PROMEDIO_REPARACION:
            datos.resumen.promedio_reparacion_dias ?? "-",

        VERSION:
            "1.0",

        ANIO:
            new Date().getFullYear()

    };

    // --------------------------------------------
    // Reemplazar variables
    // --------------------------------------------

    for (const [clave, valor] of Object.entries(variables)) {

        html = html.replaceAll(

            `{{${clave}}}`,

            valor

        );

    }

    // --------------------------------------------
    // Insertar historial
    // --------------------------------------------

    html = html.replace(

        "{{HISTORIAL}}",

        generarHistorial(datos.historial)

    );

    // --------------------------------------------
    // Imagen del equipo (preparado para el futuro)
    // --------------------------------------------

    if (!html.includes("{{IMAGEN_EQUIPO}}")) {

        // La plantilla todavía usa un recuadro fijo.
        // No hacemos nada por ahora.

    } else {

        html = html.replaceAll(
            "{{IMAGEN_EQUIPO}}",
            ""
        );

    }

    // --------------------------------------------
    // Código QR (reservado para futuras versiones)
    // --------------------------------------------

    if (html.includes("{{QR}}")) {

        html = html.replaceAll(
            "{{QR}}",
            ""
        );

    }

    // --------------------------------------------
    // Devolver HTML completo
    // --------------------------------------------

    return html;

}
