// -----------------------------------------------------
// historialHelpers.js
// Funciones auxiliares para los informes PDF
// -----------------------------------------------------

export function formatearFecha(fecha) {

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

export function estadoEquipoClase(estado = "") {

    const e = estado.toLowerCase();

    if (e.includes("activo"))
        return "estado-activo";

    if (e.includes("ingresado"))
        return "estado-ingresado";

    if (e.includes("fuera"))
        return "estado-fuera";

    if (e.includes("baja"))
        return "estado-baja";

    if (e.includes("obsoleto"))
        return "estado-obsoleto";

    return "estado-normal";

}

export function estadoMantenimiento(fin) {

    return fin
        ? "FINALIZADO"
        : "EN CURSO";

}

export function claseMantenimiento(tipo = "") {

    return tipo
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "");

}

export function colorMantenimiento(tipo = "") {

    switch (tipo.toLowerCase()) {

        case "correctivo":
            return "#d32f2f";

        case "preventivo":
            return "#2e7d32";

        case "calibración":
        case "calibracion":
            return "#1565c0";

        case "instalación":
        case "instalacion":
            return "#ef6c00";

        default:
            return "#616161";

    }

}

export function escapeHTML(texto = "") {

    return texto
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}
