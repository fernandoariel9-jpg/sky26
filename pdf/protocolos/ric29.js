// ============================================================
// RIC29
// Generador de contenido PDF del protocolo RIC29
// Sky26 - Ingeniería Clínica
// ============================================================

import {
  obtenerRIC29
} from "../ric29PDF.js";


// ============================================================
// UTILIDADES
// ============================================================

function esc(valor) {

  if (
    valor === null ||
    valor === undefined
  ) {
    return "";
  }

  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ============================================================
// FORMATEAR FECHA
// ============================================================

function fecha(valor) {

  if (!valor) {
    return "";
  }

  const d = new Date(valor);

  if (Number.isNaN(d.getTime())) {
    return esc(valor);
  }

  return d.toLocaleDateString(
    "es-AR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  );
}


// ============================================================
// RESULTADO CONFORMIDAD
// ============================================================

function conformidad(valor) {

  if (valor === true) {

    return `
      <span style="
        color:#15803d;
        font-weight:bold;
      ">
        ✓ CONFORME
      </span>
    `;

  }

  if (valor === false) {

    return `
      <span style="
        color:#b91c1c;
        font-weight:bold;
      ">
        ✗ NO CONFORME
      </span>
    `;

  }

  return `
    <span style="
      color:#666;
    ">
      No aplica
    </span>
  `;
}


// ============================================================
// GENERAR SECCIÓN DE DATOS DEL EQUIPO
// ============================================================

function generarDatosEquipo(cabecera) {

  return `

  <div class="seccion no-break">

    <div class="seccionTitulo">
      DATOS DEL EQUIPO
    </div>

    <table class="tabla">

      <tr>
        <td><b>Equipo</b></td>
        <td>${esc(cabecera.marca_modelo)}</td>
      </tr>

      <tr>
        <td><b>Marca / Modelo</b></td>
        <td>${esc(cabecera.marca_modelo)}</td>
      </tr>

      <tr>
        <td><b>Número de Serie</b></td>
        <td>${esc(cabecera.numero_serie)}</td>
      </tr>

      <tr>
        <td><b>Área</b></td>
        <td>${esc(cabecera.area)}</td>
      </tr>

      <tr>
        <td><b>Servicio</b></td>
        <td>${esc(cabecera.servicio)}</td>
      </tr>

      <tr>
        <td><b>Subservicio</b></td>
        <td>${esc(cabecera.sub_servicio)}</td>
      </tr>

      <tr>
        <td><b>Encargado</b></td>
        <td>${esc(cabecera.encargado)}</td>
      </tr>

      <tr>
        <td><b>Técnico</b></td>
        <td>${esc(cabecera.tecnico)}</td>
      </tr>

      <tr>
        <td><b>Fecha del mantenimiento</b></td>
        <td>${fecha(cabecera.fecha)}</td>
      </tr>

    </table>

  </div>

  `;
}


// ============================================================
// INSPECCIONES
// ============================================================

function generarInspecciones(inspecciones) {

  if (!inspecciones?.length) {

    return `
      <div class="seccion">
        <div class="seccionTitulo">
          1. INSPECCIÓN VISUAL
        </div>

        <p>
          Sin datos registrados.
        </p>
      </div>
    `;
  }

  const i = inspecciones[0];

  return `

  <div class="seccion">

    <div class="seccionTitulo">
      1. INSPECCIÓN VISUAL
    </div>

    <table class="tabla">

      <thead>

        <tr>

          <th>
            Inspección
          </th>

          <th>
            Resultado
          </th>

        </tr>

      </thead>

      <tbody>

        <tr>
          <td>Limpieza exterior</td>
          <td class="conforme">
            ${esc(i.limpieza_exterior)}
          </td>
        </tr>

        <tr>
          <td>Papel de registro</td>
          <td class="conforme">
            ${esc(i.papel_registro)}
          </td>
        </tr>

        <tr>
          <td>Estado de cables</td>
          <td class="conforme">
            ${esc(i.estado_cables)}
          </td>
        </tr>

      </tbody>

    </table>

    ${
      i.observaciones
        ? `
          <div class="observaciones">

            <b>Observaciones:</b>

            <br>

            ${esc(i.observaciones)}

          </div>
        `
        : ""
    }

  </div>

  `;
}


// ============================================================
// ENTREGA DE ENERGÍA
// ============================================================

function generarEnergia(energia) {

  return `

  <div class="seccion">

    <div class="seccionTitulo">
      2. ENTREGA DE ENERGÍA
    </div>

    <table class="tabla">

      <thead>

        <tr>

          <th>
            Energía nominal
          </th>

          <th>
            Resultado
          </th>

          <th>
            Incertidumbre
          </th>

          <th>
            Rango
          </th>

          <th>
            Resultado
          </th>

        </tr>

      </thead>

      <tbody>

        ${
          energia?.length
            ? energia.map((item) => `

              <tr>

                <td style="text-align:center;">
                  ${
                    item.energia_nominal !== null
                      ? `${esc(item.energia_nominal)} J`
                      : "Máx. energía"
                  }
                </td>

                <td style="text-align:center;">
                  ${
                    item.resultado_medicion !== null
                      ? `${esc(item.resultado_medicion)} J`
                      : "-"
                  }
                </td>

                <td style="text-align:center;">
                  ${
                    item.incertidumbre !== null
                      ? `± ${esc(item.incertidumbre)} J`
                      : "-"
                  }
                </td>

                <td style="text-align:center;">
                  ${
                    item.rango_min !== null &&
                    item.rango_max !== null
                      ? `${esc(item.rango_min)} - ${esc(item.rango_max)} J`
                      : "-"
                  }
                </td>

                <td class="conforme">
                  ${conformidad(item.conforme)}
                </td>

              </tr>

            `).join("")
            : `
              <tr>
                <td colspan="5">
                  Sin datos registrados.
                </td>
              </tr>
            `
        }

      </tbody>

    </table>

  </div>

  `;
}


// ============================================================
// TIEMPO DE CARGA
// ============================================================

function generarCarga(carga) {

  return `

  <div class="seccion">

    <div class="seccionTitulo">
      3. TIEMPO DE CARGA
    </div>

    <table class="tabla">

      <thead>

        <tr>

          <th>
            Medición
          </th>

          <th>
            Resultado
          </th>

          <th>
            Incertidumbre
          </th>

          <th>
            Rango máximo
          </th>

          <th>
            Resultado
          </th>

        </tr>

      </thead>

      <tbody>

        ${
          carga?.length
            ? carga.map((item) => `

              <tr>

                <td style="text-align:center;">
                  ${esc(item.numero_medicion)}
                </td>

                <td style="text-align:center;">
                  ${
                    item.resultado_medicion !== null
                      ? `${esc(item.resultado_medicion)} s`
                      : "-"
                  }
                </td>

                <td style="text-align:center;">
                  ${
                    item.incertidumbre !== null
                      ? `± ${esc(item.incertidumbre)} s`
                      : "-"
                  }
                </td>

                <td style="text-align:center;">
                  ${
                    item.rango_max !== null
                      ? `< ${esc(item.rango_max)} s`
                      : "-"
                  }
                </td>

                <td class="conforme">
                  ${conformidad(item.conforme)}
                </td>

              </tr>

            `).join("")
            : `
              <tr>
                <td colspan="5">
                  Sin datos registrados.
                </td>
              </tr>
            `
        }

      </tbody>

    </table>

  </div>

  `;
}


// ============================================================
// BATERÍA
// ============================================================

function generarBateria(bateria) {

  return `

  <div class="seccion">

    <div class="seccionTitulo">
      4. ESTADO DE BATERÍA
    </div>

    <table class="tabla">

      <thead>

        <tr>

          <th>
            Medición
          </th>

          <th>
            Resultado
          </th>

          <th>
            Incertidumbre
          </th>

          <th>
            Rango máximo
          </th>

          <th>
            Resultado
          </th>

        </tr>

      </thead>

      <tbody>

        ${
          bateria?.length
            ? bateria.map((item) => `

              <tr>

                <td style="text-align:center;">
                  ${esc(item.numero_medicion)}
                </td>

                <td style="text-align:center;">
                  ${
                    item.resultado_medicion !== null
                      ? esc(item.resultado_medicion)
                      : "-"
                  }
                </td>

                <td style="text-align:center;">
                  ${
                    item.incertidumbre !== null
                      ? `± ${esc(item.incertidumbre)}`
                      : "-"
                  }
                </td>

                <td style="text-align:center;">
                  ${
                    item.rango_max !== null
                      ? `< ${esc(item.rango_max)}`
                      : "-"
                  }
                </td>

                <td class="conforme">
                  ${conformidad(item.conforme)}
                </td>

              </tr>

            `).join("")
            : `
              <tr>
                <td colspan="5">
                  Sin datos registrados.
                </td>
              </tr>
            `
        }

      </tbody>

    </table>

  </div>

  `;
}


// ============================================================
// SINCRONISMO
// ============================================================

function generarSincronismo(sincronismo) {

  return `

  <div class="seccion">

    <div class="seccionTitulo">
      5. SINCRONISMO
    </div>

    <table class="tabla">

      <thead>

        <tr>

          <th>
            Resultado
          </th>

          <th>
            Incertidumbre
          </th>

          <th>
            Rango máximo
          </th>

          <th>
            Resultado
          </th>

        </tr>

      </thead>

      <tbody>

        ${
          sincronismo?.length
            ? sincronismo.map((item) => `

              <tr>

                <td style="text-align:center;">
                  ${
                    item.resultado_medicion !== null
                      ? `${esc(item.resultado_medicion)} ms`
                      : "-"
                  }
                </td>

                <td style="text-align:center;">
                  ${
                    item.incertidumbre !== null
                      ? `± ${esc(item.incertidumbre)} ms`
                      : "-"
                  }
                </td>

                <td style="text-align:center;">
                  ${
                    item.rango_max !== null
                      ? `< ${esc(item.rango_max)} ms`
                      : "-"
                  }
                </td>

                <td class="conforme">
                  ${conformidad(item.conforme)}
                </td>

              </tr>

            `).join("")
            : `
              <tr>
                <td colspan="4">
                  Sin datos registrados.
                </td>
              </tr>
            `
        }

      </tbody>

    </table>

  </div>

  `;
}


// ============================================================
// MONITORIZACIÓN
// ============================================================

function generarMonitorizacion(monitorizacion) {

  return `

  <div class="seccion">

    <div class="seccionTitulo">
      6. MONITORIZACIÓN
    </div>

    <table class="tabla">

      <thead>

        <tr>

          <th>
            Frecuencia nominal
          </th>

          <th>
            Resultado
          </th>

          <th>
            Incertidumbre
          </th>

          <th>
            Rango
          </th>

          <th>
            Resultado
          </th>

        </tr>

      </thead>

      <tbody>

        ${
          monitorizacion?.length
            ? monitorizacion.map((item) => `

              <tr>

                <td style="text-align:center;">
                  ${esc(item.frecuencia_nominal)} BPM
                </td>

                <td style="text-align:center;">
                  ${
                    item.resultado_medicion !== null
                      ? `${esc(item.resultado_medicion)} BPM`
                      : "-"
                  }
                </td>

                <td style="text-align:center;">
                  ${
                    item.incertidumbre !== null
                      ? `± ${esc(item.incertidumbre)} BPM`
                      : "-"
                  }
                </td>

                <td style="text-align:center;">
                  ${
                    item.frecuencia_nominal !== null
                      ? `${Number(item.frecuencia_nominal) - 3} - ${Number(item.frecuencia_nominal) + 3} BPM`
                      : "-"
                  }
                </td>

                <td class="conforme">
                  ${conformidad(item.conforme)}
                </td>

              </tr>

            `).join("")
            : `
              <tr>
                <td colspan="5">
                  Sin datos registrados.
                </td>
              </tr>
            `
        }

      </tbody>

    </table>

  </div>

  `;
}


// ============================================================
// ALARMAS
// ============================================================

function generarAlarmas(alarmas) {

  if (!alarmas?.length) {

    return `
      <div class="seccion">

        <div class="seccionTitulo">
          7. ALARMAS
        </div>

        <p>
          Sin datos registrados.
        </p>

      </div>
    `;
  }

  return `

  <div class="seccion">

    <div class="seccionTitulo">
      7. ALARMAS
    </div>

    <table class="tabla">

      <thead>

        <tr>

          <th>
            Alarma alta frecuencia
          </th>

          <th>
            Alarma baja frecuencia
          </th>

          <th>
            Activación de alarmas
          </th>

        </tr>

      </thead>

      <tbody>

        ${alarmas.map((item) => `

          <tr>

            <td style="text-align:center;">
              ${esc(item.alarma_alta_frecuencia)}
            </td>

            <td style="text-align:center;">
              ${esc(item.alarma_baja_frecuencia)}
            </td>

            <td style="text-align:center;">
              ${esc(item.activacion_alarmas)}
            </td>

          </tr>

        `).join("")}

      </tbody>

    </table>

    ${
      alarmas.some(
        item => item.observaciones
      )
        ? alarmas
            .map(item =>
              item.observaciones
                ? `
                  <div class="observaciones">

                    <b>Observaciones:</b>

                    <br>

                    ${esc(item.observaciones)}

                  </div>
                `
                : ""
            )
            .join("")
        : ""
    }

  </div>

  `;
}


// ============================================================
// RESULTADO GENERAL
// ============================================================

function generarResultadoGeneral(cabecera) {

  const conforme =
    cabecera.resultado_general === "CONFORME";

  return `

  <div class="resultado"
       style="
         ${
           conforme
             ? `
               background:#dcfce7;
               border-color:#16a34a;
               color:#166534;
             `
             : `
               background:#fee2e2;
               border-color:#dc2626;
               color:#991b1b;
             `
         }
       "
  >

    ${
      conforme
        ? "✓ MANTENIMIENTO CONFORME"
        : "✗ MANTENIMIENTO NO CONFORME"
    }

  </div>

  `;
}


// ============================================================
// OBSERVACIONES GENERALES
// ============================================================

function generarObservaciones(cabecera) {

  if (
    !cabecera.observaciones ||
    !String(cabecera.observaciones).trim()
  ) {

    return "";
  }

  return `

  <div class="observaciones">

    <b>OBSERVACIONES GENERALES</b>

    <br><br>

    ${esc(cabecera.observaciones)}

  </div>

  `;
}


// ============================================================
// GENERAR CONTENIDO COMPLETO RIC29
// ============================================================

export function generarContenidoRIC29(datos) {

  const {

    cabecera,
    inspecciones,
    energia,
    carga,
    bateria,
    sincronismo,
    monitorizacion,
    alarmas

  } = datos;


  return `

    ${generarDatosEquipo(cabecera)}

    ${generarInspecciones(inspecciones)}

    ${generarEnergia(energia)}

    ${generarCarga(carga)}

    ${generarBateria(bateria)}

    ${generarSincronismo(sincronismo)}

    ${generarMonitorizacion(monitorizacion)}

    ${generarAlarmas(alarmas)}

    ${generarResultadoGeneral(cabecera)}

    ${generarObservaciones(cabecera)}

  `;
}


// ============================================================
// FUNCIÓN PRINCIPAL RIC29
// ============================================================

export async function prepararRIC29PDF(
  client,
  ric29_id
) {

  // ----------------------------------------------------------
  // OBTENER INFORMACIÓN DESDE POSTGRESQL
  // ----------------------------------------------------------

  const datos =
    await obtenerRIC29(
      client,
      ric29_id
    );


  // ----------------------------------------------------------
  // GENERAR CONTENIDO HTML
  // ----------------------------------------------------------

  const contenido =
    generarContenidoRIC29(
      datos
    );


  // ----------------------------------------------------------
  // DEVOLVER DEFINICIÓN DEL PROTOCOLO
  // ----------------------------------------------------------

  return {

    codigo: "RIC29",

    titulo:
      "Mantenimiento Preventivo",

    subtitulo:
      "Cardiodesfibriladores",

    contenido,

    datos

  };

}
