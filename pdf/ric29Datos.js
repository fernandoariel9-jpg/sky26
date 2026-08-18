// ============================================================
// RIC29 PDF
// Definición y obtención de datos del protocolo RIC29
// ============================================================

export async function obtenerRIC29(client, ric29_id) {

  console.log("========== DEBUG RIC29 ==========");
  console.log("client es:", typeof client);
  console.log("ric29_id es:", ric29_id);
  console.log("ric29_id tipo:", typeof ric29_id);
  console.log("=================================");

  // ==========================================================
  // 1. CABECERA
  // ==========================================================

  const cabeceraResult = await client.query(
    `
SELECT
  r.id,
  r.ric01_id,
  r.equipo_id,
  r.numero_serie,
  r.marca_modelo,
  r.area,
  r.servicio,
  r.sub_servicio,
  r.encargado,
  r.fecha,
  r.tecnico,
  r.resultado_general,
  r.observaciones,
  e.descripcion
FROM ric29 r
LEFT JOIN equipos e
  ON e.id = r.equipo_id
WHERE r.id = $1
    [ric29_id]
  );

  if (cabeceraResult.rows.length === 0) {
    throw new Error("No se encontró el RIC29 solicitado.");
  }

  const cabecera = cabeceraResult.rows[0];


  // ==========================================================
  // 2. INSPECCIONES
  // ==========================================================

  const inspeccionesResult = await client.query(
    `
    SELECT
      id,
      limpieza_exterior,
      papel_registro,
      estado_cables,
      observaciones
    FROM ric29_inspecciones
    WHERE ric29_id = $1
    ORDER BY id
    `,
    [ric29_id]
  );


  // ==========================================================
  // 3. ENTREGA DE ENERGÍA
  // ==========================================================

  const energiaResult = await client.query(
    `
    SELECT
      id,
      energia_nominal,
      resultado_medicion,
      incertidumbre,
      rango_min,
      rango_max,
      conforme
    FROM ric29_energia
    WHERE ric29_id = $1
    ORDER BY id
    `,
    [ric29_id]
  );


  // ==========================================================
  // 4. TIEMPO DE CARGA
  // ==========================================================

  const cargaResult = await client.query(
    `
    SELECT
      id,
      numero_medicion,
      resultado_medicion,
      incertidumbre,
      rango_max,
      conforme
    FROM ric29_carga
    WHERE ric29_id = $1
    ORDER BY id
    `,
    [ric29_id]
  );


  // ==========================================================
  // 5. BATERÍA
  // ==========================================================

  const bateriaResult = await client.query(
    `
    SELECT
      id,
      numero_medicion,
      resultado_medicion,
      incertidumbre,
      rango_max,
      conforme,
      observaciones
    FROM ric29_bateria
    WHERE ric29_id = $1
    ORDER BY numero_medicion
    `,
    [ric29_id]
  );


  // ==========================================================
  // 6. SINCRONISMO
  // ==========================================================

  const sincronismoResult = await client.query(
    `
    SELECT
      id,
      resultado_medicion,
      incertidumbre,
      rango_max,
      conforme
    FROM ric29_sincronismo
    WHERE ric29_id = $1
    ORDER BY id
    `,
    [ric29_id]
  );


  // ==========================================================
  // 7. MONITORIZACIÓN
  // ==========================================================

  const monitorizacionResult = await client.query(
    `
    SELECT
      id,
      frecuencia_nominal,
      resultado_medicion,
      incertidumbre,
      conforme
    FROM ric29_monitorizacion
    WHERE ric29_id = $1
    ORDER BY frecuencia_nominal
    `,
    [ric29_id]
  );


  // ==========================================================
  // 8. ALARMAS
  // ==========================================================

  const alarmasResult = await client.query(
    `
    SELECT
      id,
      alarma_alta_frecuencia,
      alarma_baja_frecuencia,
      activacion_alarmas,
      observaciones
    FROM ric29_alarmas
    WHERE ric29_id = $1
    ORDER BY id
    `,
    [ric29_id]
  );


  // ==========================================================
  // 9. ARMAR OBJETO COMPLETO
  // ==========================================================

  return {

    protocolo: {
      codigo: "RIC29",
      titulo: "Mantenimiento Preventivo",
      subtitulo: "Cardiodesfibriladores"
    },

    cabecera,

    inspecciones:
      inspeccionesResult.rows,

    energia:
      energiaResult.rows,

    carga:
      cargaResult.rows,

    bateria:
      bateriaResult.rows,

    sincronismo:
      sincronismoResult.rows,

    monitorizacion:
      monitorizacionResult.rows,

    alarmas:
      alarmasResult.rows

  };

}


// ============================================================
// METADATOS DEL PROTOCOLO
// ============================================================

export const RIC29_CONFIG = {

  codigo: "RIC29",

  titulo:
    "Mantenimiento Preventivo",

  subtitulo:
    "Cardiodesfibriladores",

  secciones: [

    {
      codigo: "inspecciones",
      titulo: "1. Inspección visual"
    },

    {
      codigo: "energia",
      titulo: "2. Entrega de energía"
    },

    {
      codigo: "carga",
      titulo: "3. Tiempo de carga"
    },

    {
      codigo: "bateria",
      titulo: "4. Estado de batería"
    },

    {
      codigo: "sincronismo",
      titulo: "5. Sincronismo"
    },

    {
      codigo: "monitorizacion",
      titulo: "6. Monitorización"
    },

    {
      codigo: "alarmas",
      titulo: "7. Alarmas"
    }

  ]

};
