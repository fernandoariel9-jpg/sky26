import pool from "../db.js";

function normalizarFecha(valor) {
  if (!valor) return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function obtenerMesesPeriodo(periodo) {
  if (periodo === null || periodo === undefined || periodo === "") return null;

  if (typeof periodo === "number" || /^\d+(?:\.\d+)?$/.test(String(periodo).trim())) {
    const meses = Number(periodo);
    return Number.isFinite(meses) && meses > 0 ? meses : null;
  }

  const texto = String(periodo).trim().toUpperCase();

  if (texto.includes("ANUAL")) return 12;
  if (texto.includes("SEMESTRAL")) return 6;
  if (texto.includes("TRIMESTRAL")) return 3;
  if (texto.includes("BIMESTRAL")) return 2;
  if (texto.includes("MENSUAL")) return 1;

  const numero = Number((texto.match(/\d+(?:[.,]\d+)?/) || [])[0]?.replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0) return null;

  if (texto.includes("DIA")) return { dias: numero };
  if (texto.includes("AÑO") || texto.includes("ANIO")) return numero * 12;

  return numero;
}

function sumarPeriodo(fecha, periodo) {
  const parsed = obtenerMesesPeriodo(periodo);
  if (!parsed) return null;

  const resultado = new Date(fecha);

  if (typeof parsed === "object" && parsed.dias) {
    resultado.setDate(resultado.getDate() + parsed.dias);
  } else {
    resultado.setMonth(resultado.getMonth() + parsed);
  }

  return resultado;
}

function soloFechaISO(fecha) {
  if (!fecha) return null;
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, "0");
  const day = String(fecha.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calcularEstadoPreventivo(ultimoMant, periodo) {
  const ultimo = normalizarFecha(ultimoMant);

  if (!ultimo) {
    return {
      estado_preventivo: "SIN_PREVENTIVO",
      proximo_preventivo: null,
      dias_diferencia: null
    };
  }

  const proximo = sumarPeriodo(ultimo, periodo);
  if (!proximo) {
    return {
      estado_preventivo: "SIN_PERIODICIDAD",
      proximo_preventivo: null,
      dias_diferencia: null
    };
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  proximo.setHours(0, 0, 0, 0);

  const diferenciaMs = proximo.getTime() - hoy.getTime();
  const dias = Math.ceil(diferenciaMs / 86400000);

  return {
    estado_preventivo: dias < 0 ? "VENCIDO" : "EN_TERMINO",
    proximo_preventivo: soloFechaISO(proximo),
    dias_diferencia: dias
  };
}

export async function obtenerEquipoPublico(req, res) {
  try {
    const numeroSerie = String(req.params.numero_serie || "").trim();

    if (!numeroSerie) {
      return res.status(400).json({ error: "Número de serie requerido" });
    }

    const result = await pool.query(
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
        ultimo_mant,
        periodo
      FROM equipos
      WHERE UPPER(TRIM(numero_serie)) = UPPER(TRIM($1))
      LIMIT 1
      `,
      [numeroSerie]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }

    const equipo = result.rows[0];
    const preventivo = calcularEstadoPreventivo(equipo.ultimo_mant, equipo.periodo);

    return res.json({
      ...equipo,
      ultimo_mant: equipo.ultimo_mant ? soloFechaISO(normalizarFecha(equipo.ultimo_mant)) : null,
      ...preventivo
    });
  } catch (error) {
    console.error("Error obteniendo equipo público:", error);
    return res.status(500).json({ error: "Error al obtener la información pública del equipo" });
  }
}
