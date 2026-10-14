import pool from "../db.js";

const ESTADOS_EXCLUIDOS = new Set(["OBSOLETO", "OBSOLETOS", "DE BAJA"]);

function normalizarEstado(valor) {
  return String(valor || "").trim().toUpperCase();
}

function obtenerPeriodoDias(valor) {
  if (valor === null || valor === undefined) return null;

  const texto = String(valor).trim();
  if (!texto) return null;

  const numero = Number(texto);
  if (!Number.isInteger(numero) || numero <= 0) return null;

  return numero;
}

function parsearFecha(valor) {
  if (valor === null || valor === undefined) return null;

  const texto = String(valor).trim();
  if (!texto) return null;

  // YYYY-MM-DD o timestamp que empieza con esa fecha
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const fecha = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3])
    );
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  // DD/MM/YYYY
  const ar = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ar) {
    const fecha = new Date(
      Number(ar[3]),
      Number(ar[2]) - 1,
      Number(ar[1])
    );
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  return null;
}

function sumarDias(fecha, dias) {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

function inicioDelDia(fecha = new Date()) {
  return new Date(
    fecha.getFullYear(),
    fecha.getMonth(),
    fecha.getDate()
  );
}

export async function obtenerIndicadoresPreventivos(req, res) {
  try {
    const { rows } = await pool.query(
      "SELECT id, estado, periodo, ultimo_mant, fecha_alta FROM equipos"
    );

    const vigentes = rows.filter(
      (equipo) => !ESTADOS_EXCLUIDOS.has(normalizarEstado(equipo.estado))
    );

    const totalVigentes = vigentes.length;

    const operativos = vigentes.filter((equipo) =>
      ["ACTIVO", "ACTIVO RESTRINGIDO"].includes(
        normalizarEstado(equipo.estado)
      )
    ).length;

    const cubiertos = vigentes.filter(
      (equipo) => obtenerPeriodoDias(equipo.periodo) !== null
    ).length;

    let cubiertosCalculables = 0;
    let preventivosEnCumplimiento = 0;

    const hoy = inicioDelDia();

    for (const equipo of vigentes) {
      const periodoDias = obtenerPeriodoDias(equipo.periodo);
      if (periodoDias === null) continue;

      const fechaBase =
        parsearFecha(equipo.ultimo_mant) ||
        parsearFecha(equipo.fecha_alta);

      if (!fechaBase) continue;

      cubiertosCalculables += 1;

      const proximoMantenimiento = inicioDelDia(
        sumarDias(fechaBase, periodoDias)
      );

      if (proximoMantenimiento >= hoy) {
        preventivosEnCumplimiento += 1;
      }
    }

    return res.json({
      cobertura_preventiva:
        totalVigentes > 0
          ? Number(((cubiertos / totalVigentes) * 100).toFixed(1))
          : 0,

      cumplimiento_preventivo:
        cubiertosCalculables > 0
          ? Number(
              (
                (preventivosEnCumplimiento / cubiertosCalculables) *
                100
              ).toFixed(1)
            )
          : 0,

      equipos_operativos:
        totalVigentes > 0
          ? Number(((operativos / totalVigentes) * 100).toFixed(1))
          : 0,

      detalle: {
        total_vigentes: totalVigentes,
        cubiertos,
        cubiertos_calculables: cubiertosCalculables,
        preventivos_en_cumplimiento: preventivosEnCumplimiento,
        operativos
      }
    });
  } catch (error) {
    console.error("Error obteniendo indicadores preventivos:", error);

    return res.status(500).json({
      error: "Error obteniendo indicadores preventivos",
      detalle: error.message
    });
  }
}
