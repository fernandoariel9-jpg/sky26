// ============================================================
// CONEXIÓN CON GOOGLE DRIVE
// ============================================================

import { google } from "googleapis";

// ============================================================
// AUTENTICACIÓN
// ============================================================

const auth = new google.auth.GoogleAuth({

  credentials: {

    client_email:
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,

    private_key:
      process.env.GOOGLE_PRIVATE_KEY
        ?.replace(/\\n/g, "\n")

  },

  scopes: [
    "https://www.googleapis.com/auth/drive"
  ]

});

// ============================================================
// CLIENTE GOOGLE DRIVE
// ============================================================

const drive =
  google.drive({
    version: "v3",
    auth
  });

// ============================================================
// EXPORTAR
// ============================================================

export default drive;

// ============================================================
// BUSCAR CARPETA DENTRO DE OTRA CARPETA
// ============================================================

export async function buscarCarpeta(
  nombre,
  carpetaPadreId
) {

  const respuesta =
    await drive.files.list({

      q: [
        `'${carpetaPadreId}' in parents`,
        `name = '${nombre.replace(/'/g, "\\'")}'`,
        "mimeType = 'application/vnd.google-apps.folder'",
        "trashed = false"
      ].join(" and "),

      fields:
        "files(id,name,mimeType)",

      spaces:
        "drive",

      pageSize:
        10

    });

  if (
    !respuesta.data.files ||
    respuesta.data.files.length === 0
  ) {

    return null;

  }

  return respuesta.data.files[0];

}

// ============================================================
// OBTENER CARPETA RIC29 DEL SERVICIO Y SUBSERVICIO
// ============================================================

export async function obtenerCarpetaRIC29(
  servicio,
  subservicio
) {

  const carpetaPrincipalId =
    process.env.GOOGLE_DRIVE_RIC_FOLDER_ID;

  if (!carpetaPrincipalId) {

    throw new Error(
      "No está configurada GOOGLE_DRIVE_RIC_FOLDER_ID"
    );

  }

  if (!servicio) {

    throw new Error(
      "El equipo no tiene servicio asignado"
    );

  }

  if (!subservicio) {

    throw new Error(
      "El equipo no tiene subservicio asignado"
    );

  }

  // ----------------------------------------------------------
  // BUSCAR SERVICIO
  // ----------------------------------------------------------

  const carpetaServicio =
    await buscarCarpeta(
      servicio,
      carpetaPrincipalId
    );

  if (!carpetaServicio) {

    throw new Error(
      `No existe la carpeta de servicio: ${servicio}`
    );

  }

  // ----------------------------------------------------------
  // BUSCAR SUBSERVICIO
  // ----------------------------------------------------------

  const carpetaSubservicio =
    await buscarCarpeta(
      subservicio,
      carpetaServicio.id
    );

  if (!carpetaSubservicio) {

    throw new Error(
      `No existe la carpeta de subservicio: ${servicio} / ${subservicio}`
    );

  }

  console.log(
    "Carpeta RIC encontrada:",
    {
      servicio,
      subservicio,
      carpetaId:
        carpetaSubservicio.id
    }
  );

  return carpetaSubservicio;

}
