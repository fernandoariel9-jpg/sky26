import pool from "../db.js";

const numeroPositivo = (valor) => valor !== undefined && valor !== null && valor !== "" && Number.isFinite(Number(valor)) && Number(valor) > 0;
const numeroNoNegativo = (valor) => valor !== undefined && valor !== null && valor !== "" && Number.isFinite(Number(valor)) && Number(valor) >= 0;
const dentroTolerancia = (medicion, nominal) => Number(medicion) >= Number(nominal) * 0.85 && Number(medicion) <= Number(nominal) * 1.15;

export async function guardarAptitudCardio(req, res) {
  const client = await pool.connect();
  try {
    const { evaluacion_id = null, equipo, ric01_id = null, mantenimiento_usuario_id = null, mediciones } = req.body || {};
    if (!equipo?.id || !equipo?.numero_serie || !mediciones) {
      return res.status(400).json({ ok: false, error: "Faltan los datos de identificación del equipo o las mediciones." });
    }

    const referencias = [50, 100, 200];
    for (const referencia of referencias) {
      if (!numeroPositivo(mediciones.potencias?.[referencia])) {
        return res.status(400).json({ ok: false, error: `La medición de ${referencia} J es obligatoria y debe ser mayor que cero.` });
      }
    }
    if (!numeroPositivo(mediciones.potencia_max_fabricante) || !numeroPositivo(mediciones.potencia_max_medida)) {
      return res.status(400).json({ ok: false, error: "Debe ingresar la potencia máxima del fabricante y la potencia máxima medida." });
    }
    if (!numeroNoNegativo(mediciones.sincronismo_ms) || Number(mediciones.sincronismo_ms) >= 60) {
      if (!numeroNoNegativo(mediciones.sincronismo_ms)) return res.status(400).json({ ok: false, error: "El sincronismo es obligatorio y debe ser un número válido." });
    }
    if (!["Monofásica", "Bifásica"].includes(mediciones.tipo_onda) || typeof mediciones.onda_coincide !== "boolean") {
      return res.status(400).json({ ok: false, error: "Debe indicar el tipo de onda y confirmar si coincide con la verificación." });
    }
    if (!numeroNoNegativo(mediciones.tiempo_carga_s)) {
      return res.status(400).json({ ok: false, error: "El tiempo de carga es obligatorio y debe ser un número válido." });
    }

    const evaluaciones = [
      ...referencias.map((j) => ({
        grupo: "ENERGIA",
        orden: j,
        parametro: `Energía de descarga ${j} J`,
        valor_nominal: String(j),
        medicion: String(mediciones.potencias[j]),
        unidad: "J",
        rango_aceptacion: `${(j * 0.85).toFixed(1)} a ${(j * 1.15).toFixed(1)} J`,
        conforme: dentroTolerancia(mediciones.potencias[j], j),
        observaciones: mediciones.observaciones_potencia?.[j] || null
      })),
      {
        grupo: "ENERGIA",
        orden: 4,
        parametro: "Potencia máxima",
        valor_nominal: String(mediciones.potencia_max_fabricante),
        medicion: String(mediciones.potencia_max_medida),
        unidad: "J",
        rango_aceptacion: `${(Number(mediciones.potencia_max_fabricante) * 0.85).toFixed(1)} a ${(Number(mediciones.potencia_max_fabricante) * 1.15).toFixed(1)} J`,
        conforme: dentroTolerancia(mediciones.potencia_max_medida, mediciones.potencia_max_fabricante),
        observaciones: mediciones.observacion_potencia_max || null
      },
      {
        grupo: "SINCRONISMO",
        orden: 1,
        parametro: "Tiempo de sincronismo",
        valor_nominal: "< 60",
        medicion: String(mediciones.sincronismo_ms),
        unidad: "ms",
        rango_aceptacion: "< 60 ms",
        conforme: Number(mediciones.sincronismo_ms) < 60,
        observaciones: mediciones.observacion_sincronismo || null
      },
      {
        grupo: "FORMA_ONDA",
        orden: 1,
        parametro: "Forma de onda",
        valor_nominal: mediciones.tipo_onda,
        medicion: mediciones.onda_coincide ? "Sí" : "No",
        unidad: null,
        rango_aceptacion: "Coincidencia con el tipo de onda seleccionado",
        conforme: mediciones.onda_coincide,
        observaciones: mediciones.observacion_onda || null
      },
      {
        grupo: "CARGA",
        orden: 1,
        parametro: "Tiempo de carga",
        valor_nominal: "< 15",
        medicion: String(mediciones.tiempo_carga_s),
        unidad: "s",
        rango_aceptacion: "< 15 segundos",
        conforme: Number(mediciones.tiempo_carga_s) < 15,
        observaciones: mediciones.observacion_carga || null
      }
    ];

    const sinObservacion = evaluaciones.find((item) => item.conforme === false && !String(item.observaciones || "").trim());
    if (sinObservacion) {
      return res.status(400).json({ ok: false, error: `Debe completar la observación del parámetro no conforme: ${sinObservacion.parametro}.` });
    }

    await client.query("BEGIN");
    const equipoDB = await client.query(
      "SELECT id, numero_serie, descripcion, marca_modelo, area, servicio FROM public.equipos WHERE id = $1",
      [equipo.id]
    );
    if (!equipoDB.rowCount || String(equipoDB.rows[0].numero_serie) !== String(equipo.numero_serie)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "El equipo seleccionado no coincide con el registro de la base de datos." });
    }

    if (!mantenimiento_usuario_id) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "No existe un mantenimiento de usuario conforme asociado a esta evaluación." });
    }

    const mantenimientoResult = await client.query(
      "SELECT id, equipo_id, numero_serie, fecha, limpieza_ok, integridad_ok, verificacion_funcional_ok, capacitacion_personal_ok, observaciones, usuario_nombre, usuario_mail, tarea_id FROM public.mantenimientos_usuario WHERE id = $1 AND equipo_id = $2",
      [mantenimiento_usuario_id, equipo.id]
    );
    if (!mantenimientoResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "El mantenimiento de usuario seleccionado no corresponde al equipo." });
    }
    const mantenimiento = mantenimientoResult.rows[0];
    const controlesMantenimiento = [mantenimiento.limpieza_ok, mantenimiento.integridad_ok, mantenimiento.verificacion_funcional_ok, mantenimiento.capacitacion_personal_ok];
    if (!controlesMantenimiento.every((valor) => valor === true)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "El último mantenimiento de usuario no está completamente conforme." });
    }
    if (ric01_id) {
      const tarea = await client.query("SELECT id, numero_serie, equipo_id FROM public.ric01 WHERE id = $1", [ric01_id]);
      if (!tarea.rowCount || (tarea.rows[0].numero_serie && String(tarea.rows[0].numero_serie) !== String(equipo.numero_serie)) ||
          (tarea.rows[0].equipo_id && Number(tarea.rows[0].equipo_id) !== Number(equipo.id))) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "La tarea RIC01 indicada no corresponde al cardiodesfibrilador seleccionado." });
      }
    }

    const resultado = evaluaciones.some((item) => item.conforme === false) ? "NO CONFORME" : "PENDIENTE"; // Solo las cuatro etapas conformes permiten emitir APTO.
    let cabecera;
    if (evaluacion_id) {
      cabecera = await client.query(
        `UPDATE public.au_cardio
         SET ric01_id=$1, numero_serie=$3, descripcion=$4, marca_modelo=$5, area=$6, servicio=$7,
             personal_id=$8, tecnico=$9, resultado_general=$10, mantenimiento_usuario_id=$11,
             mantenimiento_usuario_fecha=$12, mantenimiento_usuario_limpieza_ok=$13,
             mantenimiento_usuario_integridad_ok=$14, mantenimiento_usuario_verificacion_funcional_ok=$15,
             mantenimiento_usuario_capacitacion_personal_ok=$16, mantenimiento_usuario_observaciones=$17,
             mantenimiento_usuario_nombre=$18, mantenimiento_usuario_mail=$19, mantenimiento_usuario_tarea_id=$20
         WHERE id=$21 AND equipo_id=$2
         RETURNING id, fecha, resultado_general`,
        [ric01_id || null, equipo.id, equipo.numero_serie, equipoDB.rows[0].descripcion,
         equipoDB.rows[0].marca_modelo, equipoDB.rows[0].area, equipoDB.rows[0].servicio,
         req.personal.id, req.personal.nombre, resultado, mantenimiento.id, mantenimiento.fecha,
         mantenimiento.limpieza_ok, mantenimiento.integridad_ok, mantenimiento.verificacion_funcional_ok,
         mantenimiento.capacitacion_personal_ok, mantenimiento.observaciones, mantenimiento.usuario_nombre,
         mantenimiento.usuario_mail, mantenimiento.tarea_id, evaluacion_id]
      );
      if (!cabecera.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "No se encontró la evaluación AU Cardio indicada para este equipo." });
      }
      await client.query("DELETE FROM public.au_cardio_mediciones WHERE au_cardio_id=$1", [evaluacion_id]);
    } else {
      cabecera = await client.query(
        `INSERT INTO public.au_cardio
         (ric01_id,equipo_id,numero_serie,descripcion,marca_modelo,area,servicio,fecha,personal_id,tecnico,resultado_general,mantenimiento_usuario_id,mantenimiento_usuario_fecha,mantenimiento_usuario_limpieza_ok,mantenimiento_usuario_integridad_ok,mantenimiento_usuario_verificacion_funcional_ok,mantenimiento_usuario_capacitacion_personal_ok,mantenimiento_usuario_observaciones,mantenimiento_usuario_nombre,mantenimiento_usuario_mail,mantenimiento_usuario_tarea_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id,fecha,resultado_general`,
        [ric01_id || null,equipo.id,equipo.numero_serie,equipoDB.rows[0].descripcion,equipoDB.rows[0].marca_modelo,
         equipoDB.rows[0].area,equipoDB.rows[0].servicio,req.personal.id,req.personal.nombre,resultado,
         mantenimiento.id,mantenimiento.fecha,mantenimiento.limpieza_ok,mantenimiento.integridad_ok,
         mantenimiento.verificacion_funcional_ok,mantenimiento.capacitacion_personal_ok,mantenimiento.observaciones,
         mantenimiento.usuario_nombre,mantenimiento.usuario_mail,mantenimiento.tarea_id]
      );
    }

    for (const item of evaluaciones) {
      await client.query(
        `INSERT INTO public.au_cardio_mediciones
         (au_cardio_id,grupo,orden,parametro,valor_nominal,medicion,unidad,rango_aceptacion,conforme,observaciones)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [cabecera.rows[0].id,item.grupo,item.orden,item.parametro,item.valor_nominal,item.medicion,
         item.unidad,item.rango_aceptacion,item.conforme,item.observaciones]
      );
    }
    await client.query("COMMIT");
    return res.status(201).json({ ok: true, id: cabecera.rows[0].id, fecha: cabecera.rows[0].fecha, resultado_general: resultado });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error guardando AU Cardio:", error);
    return res.status(500).json({ ok: false, error: "No se pudo guardar la evaluación de aptitud de uso." });
  } finally {
    client.release();
  }
}


export async function obtenerUltimaAptitudCardio(req, res) {
  const equipoId = Number(req.params.equipoId);
  if (!Number.isInteger(equipoId) || equipoId <= 0) {
    return res.status(400).json({ ok: false, error: "Identificador de equipo inválido." });
  }

  try {
    const cabecera = await pool.query(
      `SELECT id, ric01_id, equipo_id, numero_serie, descripcion, marca_modelo,
              area, servicio, fecha, personal_id, tecnico, resultado_general,
              mantenimiento_usuario_id, mantenimiento_usuario_fecha,
              mantenimiento_usuario_limpieza_ok, mantenimiento_usuario_integridad_ok,
              mantenimiento_usuario_verificacion_funcional_ok,
              mantenimiento_usuario_capacitacion_personal_ok,
              mantenimiento_usuario_observaciones, mantenimiento_usuario_nombre,
              mantenimiento_usuario_mail, mantenimiento_usuario_tarea_id
       FROM public.au_cardio
       WHERE equipo_id = $1
       ORDER BY fecha DESC NULLS LAST, id DESC
       LIMIT 1`,
      [equipoId]
    );

    if (!cabecera.rowCount) return res.json({ ok: true, evaluacion: null });

    const evaluacion = cabecera.rows[0];
    const mediciones = await pool.query(
      `SELECT grupo, orden, parametro, valor_nominal, medicion, unidad,
              rango_aceptacion, conforme, observaciones
       FROM public.au_cardio_mediciones
       WHERE au_cardio_id = $1
       ORDER BY grupo, orden`,
      [evaluacion.id]
    );

    return res.json({ ok: true, evaluacion: { ...evaluacion, mediciones: mediciones.rows } });
  } catch (error) {
    console.error("Error recuperando última AU Cardio:", error);
    return res.status(500).json({ ok: false, error: "No se pudo recuperar la última evaluación AU Cardio." });
  }
}

export async function eliminarAptitudCardio(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: "Identificador de evaluación inválido." });
  try {
    const result = await pool.query(
      "DELETE FROM public.au_cardio WHERE id = $1 AND personal_id = $2 RETURNING id",
      [id, req.personal.id]
    );
    if (!result.rowCount) return res.status(404).json({ ok: false, error: "No se encontró una evaluación propia para cancelar." });
    res.json({ ok: true, id });
  } catch (error) {
    console.error("Error eliminando AU Cardio:", error);
    res.status(500).json({ ok: false, error: "No se pudo eliminar la evaluación." });
  }
}
