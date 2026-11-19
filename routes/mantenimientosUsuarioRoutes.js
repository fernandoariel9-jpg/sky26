import express from "express";
import pool from "../db.js";
import webpush from "web-push";

const router = express.Router();

function fechaLocalArgentina() {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(ahora).reduce((acc, parte) => {
    acc[parte.type] = parte.value;
    return acc;
  }, {});

  return `${partes.year}-${partes.month}-${partes.day} ${partes.hour}:${partes.minute}:${partes.second}`;
}

async function notificarNuevaTarea(area, tarea) {
  if (!area) return;

  try {
    const personal = await pool.query(
      "SELECT suscripcion FROM personal WHERE area = $1 AND suscripcion IS NOT NULL",
      [area]
    );

    const payload = JSON.stringify({
      title: "Nueva tarea asignada",
      body: tarea,
      icon: "/icon-192x192.png"
    });

    await Promise.all(personal.rows.map(async ({ suscripcion }) => {
      try {
        const subscription = typeof suscripcion === "string"
          ? JSON.parse(suscripcion)
          : suscripcion;
        await webpush.sendNotification(subscription, payload);
      } catch (error) {
        console.warn("No se pudo enviar notificación de mantenimiento de usuario:", error.message);
      }
    }));
  } catch (error) {
    console.error("Error notificando tarea de mantenimiento de usuario:", error);
  }
}


/**
 * Devuelve el último mantenimiento de usuario registrado para un equipo.
 * Este historial es independiente de las evaluaciones AU Cardio.
 */
router.get("/equipo/:equipoId/ultimo", async (req, res) => {
  const equipoId = Number(req.params.equipoId);
  if (!Number.isInteger(equipoId) || equipoId <= 0) {
    return res.status(400).json({ ok: false, error: "Identificador de equipo inválido." });
  }

  try {
    const result = await pool.query(
      `SELECT
         id,
         equipo_id,
         numero_serie,
         fecha,
         limpieza_ok,
         integridad_ok,
         verificacion_funcional_ok,
         capacitacion_personal_ok,
         observaciones,
         usuario_nombre,
         usuario_mail,
         tarea_id
       FROM public.mantenimientos_usuario
       WHERE equipo_id = $1
       ORDER BY fecha DESC NULLS LAST, id DESC
       LIMIT 1`,
      [equipoId]
    );

    return res.json({ ok: true, mantenimiento: result.rows[0] || null });
  } catch (error) {
    console.error("Error consultando último mantenimiento de usuario:", error);
    return res.status(500).json({ ok: false, error: "No se pudo consultar el último mantenimiento de usuario." });
  }
});

// ============================================================
// MANTENIMIENTO DE USUARIO
// Guarda el checklist y, si hay no conformidades, crea una
// tarea correctiva vinculada en ric01. No depende de ningún RIC.
// ============================================================
router.post("/", async (req, res) => {
  const client = await pool.connect();
  let areaParaNotificar = null;
  let tareaParaNotificar = null;

  try {
    const {
      equipo_id,
      numero_serie,
      limpieza_ok,
      integridad_ok,
      verificacion_funcional_ok,
      capacitacion_personal_ok,
      observaciones,
      usuario_nombre,
      usuario_mail
    } = req.body || {};

    const resultados = [
      limpieza_ok,
      integridad_ok,
      verificacion_funcional_ok,
      capacitacion_personal_ok
    ];

    if (resultados.some(valor => typeof valor !== "boolean")) {
      return res.status(400).json({
        error: "Debe indicar Conforme o No conforme en todos los puntos del checklist."
      });
    }

    const hayNoConformidad = resultados.some(valor => valor === false);
    const observacionesLimpias = String(observaciones || "").trim();

    if (hayNoConformidad && !observacionesLimpias) {
      return res.status(400).json({
        error: "Debe ingresar observaciones cuando algún punto no está conforme."
      });
    }

    if ((equipo_id === null || equipo_id === undefined || String(equipo_id).trim() === "")
      && !String(numero_serie || "").trim()) {
      return res.status(400).json({
        error: "El QR no contiene un número de serie o ID de equipo válido."
      });
    }

    await client.query("BEGIN");

    let equipoResult;
    if (equipo_id !== null && equipo_id !== undefined && String(equipo_id).trim() !== "") {
      equipoResult = await client.query(
        `SELECT id, numero_serie, descripcion, marca_modelo, area, servicio, sub_servicio
         FROM equipos
         WHERE id = $1
         LIMIT 1`,
        [equipo_id]
      );
    } else {
      equipoResult = await client.query(
        `SELECT id, numero_serie, descripcion, marca_modelo, area, servicio, sub_servicio
         FROM equipos
         WHERE LOWER(TRIM(numero_serie)) = LOWER(TRIM($1))
         LIMIT 1`,
        [String(numero_serie).trim()]
      );
    }

    if (!equipoResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No se encontró el equipo en la base de datos." });
    }

    const equipo = equipoResult.rows[0];

    // Recuperar los datos del usuario para asignar correctamente el origen
    // y el área de la tarea. Si no se encuentra, se usan los datos del equipo.
    let usuarioDB = null;
    const mail = String(usuario_mail || "").trim().toLowerCase();
    if (mail) {
      const usuarioResult = await client.query(
        `SELECT nombre, mail, area, servicio, subservicio
         FROM usuarios
         WHERE TRIM(LOWER(mail)) = TRIM(LOWER($1))
         LIMIT 1`,
        [mail]
      );
      usuarioDB = usuarioResult.rows[0] || null;
    }

    const nombreSolicitante = String(usuario_nombre || usuarioDB?.nombre || "").trim()
      || "Usuario de mantenimiento";
    const mailSolicitante = String(usuarioDB?.mail || mail || "").trim() || null;
    const areaTarea = equipo.area || usuarioDB?.area || null;
    const servicioTarea = equipo.servicio || usuarioDB?.servicio || null;
    const subservicioTarea = equipo.sub_servicio || usuarioDB?.subservicio || null;

    const mantenimientoResult = await client.query(
      `INSERT INTO public.mantenimientos_usuario (
         equipo_id,
         numero_serie,
         limpieza_ok,
         integridad_ok,
         verificacion_funcional_ok,
         capacitacion_personal_ok,
         observaciones,
         usuario_nombre,
         usuario_mail
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, equipo_id, numero_serie, fecha,
                 limpieza_ok, integridad_ok,
                 verificacion_funcional_ok, capacitacion_personal_ok,
                 observaciones, usuario_nombre, usuario_mail, tarea_id`,
      [
        equipo.id,
        equipo.numero_serie,
        limpieza_ok,
        integridad_ok,
        verificacion_funcional_ok,
        capacitacion_personal_ok,
        observacionesLimpias || null,
        nombreSolicitante,
        mailSolicitante
      ]
    );

    const mantenimiento = mantenimientoResult.rows[0];
    let tareaCreada = null;

    if (hayNoConformidad) {
      const datosEquipo = [
        equipo.descripcion || "Equipo sin descripción",
        equipo.marca_modelo ? `Marca/modelo: ${equipo.marca_modelo}` : null,
        `N/S: ${equipo.numero_serie}`,
        equipo.servicio ? `Servicio: ${equipo.servicio}` : null
      ].filter(Boolean).join(" - ");

      const textoTarea = `Mantenimiento de usuario - ${datosEquipo} - Observaciones: ${observacionesLimpias}`;

      const tareaResult = await client.query(
        `INSERT INTO ric01 (
           usuario,
           solicitado_por,
           tarea,
           fin,
           imagen,
           fecha,
           fecha_comp,
           fecha_fin,
           area,
           servicio,
           subservicio,
           descripcion,
           marca_modelo,
           numero_serie,
           equipo_id,
           tipo_mantenimiento,
           origen
         )
         VALUES ($1,$2,$3,FALSE,NULL,$4,NULL,NULL,$5,$6,$7,$8,$9,$10,$11,'Correctivo','usuario')
         RETURNING id, tarea, fecha, area, servicio, subservicio, equipo_id, numero_serie`,
        [
          nombreSolicitante,
          mailSolicitante,
          textoTarea,
          fechaLocalArgentina(),
          areaTarea,
          servicioTarea,
          subservicioTarea,
          equipo.descripcion || null,
          equipo.marca_modelo || null,
          equipo.numero_serie,
          equipo.id
        ]
      );

      tareaCreada = tareaResult.rows[0];

      await client.query(
        `UPDATE public.mantenimientos_usuario
         SET tarea_id = $1
         WHERE id = $2`,
        [tareaCreada.id, mantenimiento.id]
      );

      mantenimiento.tarea_id = tareaCreada.id;
      areaParaNotificar = areaTarea;
      tareaParaNotificar = textoTarea;
    }

    await client.query("COMMIT");

    // Las notificaciones se envían después del COMMIT para que un fallo
    // del servicio push no revierta el registro ni la tarea.
    if (tareaCreada) {
      await notificarNuevaTarea(areaParaNotificar, tareaParaNotificar);
    }

    return res.status(201).json({
      ok: true,
      mensaje: hayNoConformidad
        ? "Mantenimiento guardado y tarea correctiva creada."
        : "Mantenimiento de usuario guardado correctamente.",
      mantenimiento,
      tarea: tareaCreada,
      genero_tarea: Boolean(tareaCreada)
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error guardando mantenimiento de usuario:", error);
    return res.status(500).json({
      error: "No se pudo guardar el mantenimiento de usuario."
    });
  } finally {
    client.release();
  }
});

export default router;
