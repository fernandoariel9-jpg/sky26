// -----------------------------------------------------
// historialHTML.js
// Generador del HTML del historial de equipos
// -----------------------------------------------------

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

import {
    formatearFecha,
    estadoEquipoClase,
    estadoMantenimiento,
    claseMantenimiento,
    colorMantenimiento,
    escapeHTML
} from "./historialHelpers.js";

// -----------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -----------------------------------------------------
// Genera el HTML completo
// -----------------------------------------------------

export async function generarHTML(datos) {

    const templatePath = path.join(
        __dirname,
        "../templates/historialEquipo.html"
    );

    let html = fs.readFileSync(
        templatePath,
        "utf8"
    );

    // ----------------------------------------
    // Cargar CSS
    // ----------------------------------------

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

    // ----------------------------------------
    // Logo
    // ----------------------------------------

    const logoPath = path.join(
        __dirname,
        "../public/logosmall_old.png"
    );

    if (fs.existsSync(logoPath)) {

        const logoBase64 = fs
            .readFileSync(logoPath)
            .toString("base64");

        html = html.replace(
            "{{LOGO}}",
            `data:image/png;base64,${logoBase64}`
        );

    } else {

        html = html.replace(
            "{{LOGO}}",
            ""
        );

    }

    // ----------------------------------------
    // Datos del encabezado
    // ----------------------------------------

    html = html.replaceAll(
        "{{HOSPITAL}}",
        "Hospital P. D. Dr. Guillermo Rawson"
    );

    html = html.replaceAll(
        "{{FECHA}}",
        formatearFecha(new Date())
    );

    html = html.replaceAll(
        "{{DESCRIPCION}}",
        escapeHTML(datos.equipo.descripcion || "-")
    );

    html = html.replaceAll(
        "{{MARCA}}",
        escapeHTML(datos.equipo.marca_modelo || "-")
    );

    html = html.replaceAll(
        "{{SERIE}}",
        escapeHTML(datos.equipo.numero_serie || "-")
    );

    html = html.replaceAll(
        "{{SERVICIO}}",
        escapeHTML(datos.equipo.servicio || "-")
    );

    html = html.replaceAll(
        "{{AREA}}",
        escapeHTML(datos.equipo.area || "-")
    );

    html = html.replaceAll(
        "{{ULTIMO}}",
        formatearFecha(datos.equipo.ultimo_mant)
    );

    // ----------------------------------------
    // Estado del equipo
    // ----------------------------------------

    html = html.replaceAll(
        "{{ESTADO}}",
        `
        <span class="${estadoEquipoClase(datos.equipo.estado)}">
            ${escapeHTML(datos.equipo.estado || "-")}
        </span>
        `
    );

    // ----------------------------------------
    // Resumen estadístico
    // ----------------------------------------

    html = html.replaceAll(
        "{{TOTAL}}",
        datos.resumen.total ?? 0
    );

    html = html.replaceAll(
        "{{CORRECTIVOS}}",
        datos.resumen.correctivos ?? 0
    );

    html = html.replaceAll(
        "{{PREVENTIVOS}}",
        datos.resumen.preventivos ?? 0
    );

    html = html.replaceAll(
        "{{CALIBRACIONES}}",
        datos.resumen.calibraciones ?? 0
    );

    html = html.replaceAll(
        "{{INSTALACIONES}}",
        datos.resumen.instalaciones ?? 0
    );

    html = html.replaceAll(
        "{{PRIMER_MANTENIMIENTO}}",
        formatearFecha(datos.resumen.primer_mantenimiento)
    );

    html = html.replaceAll(
        "{{ULTIMA_INTERVENCION}}",
        formatearFecha(datos.resumen.ultima_intervencion)
    );

    html = html.replaceAll(
        "{{PROMEDIO_REPARACION}}",
        datos.resumen.promedio_reparacion_dias ?? "-"
    );

    // ----------------------------------------
    // Aquí se insertará el historial
    // ----------------------------------------

    let historialHTML = "";
