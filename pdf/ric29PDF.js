// ============================================================
// RIC29 PDF
// Preparación de datos para el motor común protocoloPDF.js
// ============================================================

import {
  obtenerRIC29
} from "./protocolosConsultas.js";

import {
  generarProtocoloPDF
} from "./protocoloPDF.js";

// ============================================================
// ESCAPAR HTML
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

  if (!valor) return "";

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

function estado(conforme) {

  if (conforme === true) {

    return `
      <span class="conforme">
        CONFORME
      </span>
    `;
  }

  if (conforme === false) {

    return `
      <span class="no-conforme">
        NO CONFORME
      </span>
    `;
  }

  return `
    <span class="na">
      NO APLICA
    </span>
  `;
}


// ============================================================
// INSPECCIONES
// ============================================================

function generarInspecciones(
  datos
) {

  const item =
    datos.inspecciones?.[0];

  if (!item) {

    return `
      <p class="sin-datos">
        Sin datos registrados.
      </p>
    `;
  }

  return `

    <table class="tabla">

      <thead>
        <tr>
          <th>Inspección</th>
          <th>Resultado</th>
        </tr>
      </thead>

      <tbody>

        <tr>
          <td>Limpieza exterior</td>
          <td>${esc(item.limpieza_exterior)}</td>
        </tr>

        <tr>
          <td>Papel de registro</td>
          <td>${esc(item.papel_registro)}</td>
        </tr>

        <tr>
          <td>Estado de cables</td>
          <td>${esc(item.estado_cables)}</td>
        </tr>

      </tbody>

    </table>

    ${
      item.observaciones
        ? `
          <div class="observaciones">
            <b>Observaciones:</b>
            ${esc(item.observaciones)}
          </div>
        `
        : ""
    }

  `;
}


// ============================================================
// ENTREGA DE ENERGÍA
// ============================================================

function generarEnergia(
  datos
) {

  if (!datos.energia?.length) {

    return `
      <p class="sin-datos">
        Sin datos registrados.
      </p>
    `;
  }

  return `

    <table class="tabla">

      <thead>

        <tr>
          <th>Energía nominal</th>
          <th>Resultado</th>
          <th>Incertidumbre</th>
          <th>Rango</th>
          <th>Resultado</th>
        </tr>

      </thead>

      <tbody>

        ${
          datos.energia.map(item => `

            <tr>

              <td>
                ${
                  item.energia_nominal !== null
                    ? `${esc(item.energia_nominal)} J`
                    : "Máx. energía"
                }
              </td>

              <td>
                ${
                  item.resultado_medicion !== null
                    ? `${esc(item.resultado_medicion)} J`
                    : "-"
                }
              </td>

              <td>
                ${
                  item.incertidumbre !== null
                    ? `± ${esc(item.incertidumbre)} J`
                    : "-"
                }
              </td>

              <td>
                ${
                  item.rango_min !== null &&
                  item.rango_max !== null
                    ? `${esc(item.rango_min)} - ${esc(item.rango_max)} J`
                    : "-"
                }
              </td>

              <td>
                ${estado(item.conforme)}
              </td>

            </tr>

          `).join("")
        }

      </tbody>

    </table>

  `;
}


// ============================================================
// TIEMPO DE CARGA
// ============================================================

function generarCarga(
  datos
) {

  const item =
    datos.carga?.[0];

  if (!item) {

    return `
      <p class="sin-datos">
        Sin datos registrados.
      </p>
    `;
  }

  return `

    <table class="tabla">

      <thead>

        <tr>
          <th>Medición</th>
          <th>Resultado</th>
          <th>Incertidumbre</th>
          <th>Rango máximo</th>
          <th>Resultado</th>
        </tr>

      </thead>

      <tbody>

        <tr>

          <td>
            ${esc(item.numero_medicion)}
          </td>

          <td>
            ${
              item.resultado_medicion !== null
                ? `${esc(item.resultado_medicion)} s`
                : "-"
            }
          </td>

          <td>
            ${
              item.incertidumbre !== null
                ? `± ${esc(item.incertidumbre)}`
                : "-"
            }
          </td>

          <td>
            &lt;
            ${esc(item.rango_max)}
            s
          </td>

          <td>
            ${estado(item.conforme)}
          </td>

        </tr>

      </tbody>

    </table>

  `;
}


// ============================================================
// BATERÍA
// ============================================================

function generarBateria(
  datos
) {

  if (!datos.bateria?.length) {

    return `
      <p class="sin-datos">
        Sin datos registrados.
      </p>
    `;
  }

  return `

    <table class="tabla">

      <thead>

        <tr>
          <th>Medición</th>
          <th>Resultado</th>
          <th>Incertidumbre</th>
          <th>Rango máximo</th>
          <th>Resultado</th>
        </tr>

      </thead>

      <tbody>

        ${
          datos.bateria.map(item => `

            <tr>

              <td>
                ${esc(item.numero_medicion)}
              </td>

              <td>
                ${
                  item.resultado_medicion !== null
                    ? esc(item.resultado_medicion)
                    : "-"
                }
              </td>

              <td>
                ${
                  item.incertidumbre !== null
                    ? `± ${esc(item.incertidumbre)}`
                    : "-"
                }
              </td>

              <td>
                &lt;
                ${esc(item.rango_max)}
              </td>

              <td>
                ${estado(item.conforme)}
              </td>

            </tr>

          `).join("")
        }

      </tbody>

    </table>

  `;
}


// ============================================================
// SINCRONISMO
// ============================================================

function generarSincronismo(
  datos
) {

  const item =
    datos.sincronismo?.[0];

  if (!item) {

    return `
      <p class="sin-datos">
        Sin datos registrados.
      </p>
    `;
  }

  return `

    <table class="tabla">

      <thead>

        <tr>
          <th>Resultado</th>
          <th>Incertidumbre</th>
          <th>Rango máximo</th>
          <th>Resultado</th>
        </tr>

      </thead>

      <tbody>

        <tr>

          <td>
            ${
              item.resultado_medicion !== null
                ? `${esc(item.resultado_medicion)} ms`
                : "-"
            }
          </td>

          <td>
            ${
              item.incertidumbre !== null
                ? `± ${esc(item.incertidumbre)} ms`
                : "-"
            }
          </td>

          <td>
            &lt;
            ${esc(item.rango_max)}
            ms
          </td>

          <td>
            ${estado(item.conforme)}
          </td>

        </tr>

      </tbody>

    </table>

  `;
}


// ============================================================
// MONITORIZACIÓN
// ============================================================

function generarMonitorizacion(
  datos
) {

  if (!datos.monitorizacion?.length) {

    return `
      <p class="sin-datos">
        Sin datos registrados.
      </p>
    `;
  }

  return `

    <table class="tabla">

      <thead>

        <tr>
          <th>Frecuencia nominal</th>
          <th>Resultado</th>
          <th>Incertidumbre</th>
          <th>Rango</th>
          <th>Resultado</th>
        </tr>

      </thead>

      <tbody>

        ${
          datos.monitorizacion.map(item => {

            const nominal =
              Number(item.frecuencia_nominal);

            return `

              <tr>

                <td>
                  ${esc(nominal)} BPM
                </td>

                <td>
                  ${
                    item.resultado_medicion !== null
                      ? `${esc(item.resultado_medicion)} BPM`
                      : "-"
                  }
                </td>

                <td>
                  ${
                    item.incertidumbre !== null
                      ? `± ${esc(item.incertidumbre)} BPM`
                      : "-"
                  }
                </td>

                <td>
                  ${nominal - 3}
                  -
                  ${nominal + 3}
                  BPM
                </td>

                <td>
                  ${estado(item.conforme)}
                </td>

              </tr>

            `;
          }).join("")
        }

      </tbody>

    </table>

  `;
}


// ============================================================
// ALARMAS
// ============================================================

function generarAlarmas(
  datos
) {

  const item =
    datos.alarmas?.[0];

  if (!item) {

    return `
      <p class="sin-datos">
        Sin datos registrados.
      </p>
    `;
  }

  return `

    <table class="tabla">

      <thead>

        <tr>
          <th>Alarma alta frecuencia</th>
          <th>Alarma baja frecuencia</th>
          <th>Activación de alarmas</th>
        </tr>

      </thead>

      <tbody>

        <tr>

          <td>
            ${esc(item.alarma_alta_frecuencia)}
          </td>

          <td>
            ${esc(item.alarma_baja_frecuencia)}
          </td>

          <td>
            ${esc(item.activacion_alarmas)}
          </td>

        </tr>

      </tbody>

    </table>

    ${
      item.observaciones
        ? `
          <div class="observaciones">
            <b>Observaciones:</b>
            ${esc(item.observaciones)}
          </div>
        `
        : ""
    }

  `;
}


// ============================================================
// GENERAR HTML DINÁMICO
// ============================================================

function generarContenido(
  datos
) {

  return {

    INSPECCIONES:
      generarInspecciones(datos),

    ENERGIA:
      generarEnergia(datos),

    CARGA:
      generarCarga(datos),

    BATERIA:
      generarBateria(datos),

    SINCRONISMO:
      generarSincronismo(datos),

    MONITORIZACION:
      generarMonitorizacion(datos),

    ALARMAS:
      generarAlarmas(datos)

  };
}


// ============================================================
// GENERAR PDF RIC29
// ============================================================

export async function generarRIC29PDF(
  ric29_id
) {

  // ----------------------------------------------------------
  // OBTENER DATOS
  // ----------------------------------------------------------

  const datos =
    await obtenerRIC29(
      ric29_id
    );

  // ----------------------------------------------------------
  // CONTENIDO DE SECCIONES
  // ----------------------------------------------------------

  const contenido =
    generarContenido(datos);


  // ----------------------------------------------------------
  // VARIABLES
  // ----------------------------------------------------------

const cab = datos;

  const variables = {

    CODIGO:
      "RIC29"

    TITULO:
      "Mantenimiento Preventivo"

    SUBTITULO:
      "Cardiodesfibriladores"

    DESCRIPCION:
      esc(cab.descripcion || ""),

    MARCA_MODELO:
      esc(cab.marca_modelo || ""),

    SERIE:
      esc(cab.numero_serie || ""),

    AREA:
      esc(cab.area || ""),

    SERVICIO:
      esc(cab.servicio || ""),

    SUB_SERVICIO:
      esc(cab.sub_servicio || ""),

    ENCARGADO:
      esc(cab.encargado || ""),

    TECNICO:
      esc(cab.tecnico || ""),

    FECHA_MANTENIMIENTO:
      fecha(cab.fecha),

    RESULTADO_GENERAL:
      esc(cab.resultado_general || ""),

    OBSERVACIONES:
      esc(cab.observaciones || ""),

    INSPECCIONES:
      contenido.INSPECCIONES,

    ENERGIA:
      contenido.ENERGIA,

    CARGA:
      contenido.CARGA,

    BATERIA:
      contenido.BATERIA,

    SINCRONISMO:
      contenido.SINCRONISMO,

    MONITORIZACION:
      contenido.MONITORIZACION,

    ALARMAS:
      contenido.ALARMAS

  };


  // ----------------------------------------------------------
  // GENERAR PDF
  // ----------------------------------------------------------

  return generarProtocoloPDF({

    plantilla: "ric29.html",

    variables,

    nombreArchivo:
      `RIC29_${ric29_id}.pdf`,

    formato: "A4",

    orientacion: "portrait"

  });

}
