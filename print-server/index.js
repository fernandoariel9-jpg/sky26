import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import axios from "axios";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, "config.json");

if (!fs.existsSync(configPath)) {
  console.error("Falta print-server/config.json");
  console.error("Copiá config.example.json como config.json y completá token/rutas.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const backend = String(config.backend || "").replace(/\/$/, "");
const token = String(config.token || "").trim();
const intervaloMs = Math.max(Number(config.intervalo_ms) || 5000, 2000);
const equipo = config.equipo || os.hostname();
const sumatra = config.sumatra;

if (!backend || !token || !sumatra) {
  console.error("config.json incompleto: backend, token y sumatra son obligatorios");
  process.exit(1);
}

const headersServidor = {
  "x-print-token": token,
  "Content-Type": "application/json"
};

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function heartbeat() {
  try {
    await axios.post(
      `${backend}/api/stock/impresiones/heartbeat`,
      { equipo, version: "1.0.0" },
      { headers: headersServidor, timeout: 10000 }
    );
  } catch (error) {
    console.warn("Heartbeat falló:", error.response?.data || error.message);
  }
}

async function tomarTrabajo() {
  try {
    const response = await axios.get(
      `${backend}/api/stock/impresiones/siguiente`,
      {
        headers: headersServidor,
        timeout: 15000,
        validateStatus: (status) => status === 200 || status === 204
      }
    );

    if (response.status === 204) return null;
    return response.data?.impresion || null;
  } catch (error) {
    console.warn("No se pudo consultar la cola:", error.response?.data || error.message);
    return null;
  }
}

async function informarResultado(id, ok, error = null) {
  try {
    await axios.put(
      `${backend}/api/stock/impresiones/${id}/finalizar`,
      { ok, error },
      { headers: headersServidor, timeout: 10000 }
    );
  } catch (err) {
    console.error(`No se pudo informar el resultado del trabajo ${id}:`, err.response?.data || err.message);
  }
}

async function descargarPdf(url, id) {
  const archivo = path.join(os.tmpdir(), `sky26-print-${id}-${Date.now()}.pdf`);

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000
  });

  fs.writeFileSync(archivo, response.data);
  return archivo;
}

function imprimirPdf(archivo, impresora, copias = 1) {
  return new Promise((resolve, reject) => {
    const argumentos = [
      "-silent",
      "-print-to",
      impresora,
      "-print-settings",
      `${copias}x`,
      archivo
    ];

    execFile(sumatra, argumentos, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function procesarTrabajo(trabajo) {
  const alias = String(trabajo.impresora || "").trim().toLowerCase();
  const impresoraConfig = config.impresoras?.[alias];

  if (!impresoraConfig?.nombre) {
    throw new Error(`No existe configuración local para la impresora '${alias}'`);
  }

  if (String(trabajo.tipo || "").toLowerCase() !== "pdf") {
    throw new Error(`Tipo de impresión '${trabajo.tipo}' todavía no soportado por este agente`);
  }

  if (!trabajo.documento_url) {
    throw new Error("El trabajo PDF no tiene documento_url");
  }

  const archivo = await descargarPdf(trabajo.documento_url, trabajo.id);

  try {
    await imprimirPdf(
      archivo,
      impresoraConfig.nombre,
      Number(trabajo.copias) || 1
    );
  } finally {
    try {
      fs.unlinkSync(archivo);
    } catch {}
  }
}

async function ciclo() {
  console.log("Sky26 Print Server iniciado");
  console.log("Equipo:", equipo);
  console.log("Backend:", backend);
  console.log("Impresora láser:", config.impresoras?.laser?.nombre || "sin configurar");

  await heartbeat();
  let ultimoHeartbeat = Date.now();

  while (true) {
    try {
      if (Date.now() - ultimoHeartbeat > 60000) {
        await heartbeat();
        ultimoHeartbeat = Date.now();
      }

      const trabajo = await tomarTrabajo();

      if (!trabajo) {
        await dormir(intervaloMs);
        continue;
      }

      console.log(`Trabajo #${trabajo.id}: ${trabajo.tipo} -> ${trabajo.impresora}`);

      try {
        await procesarTrabajo(trabajo);
        await informarResultado(trabajo.id, true);
        console.log(`Trabajo #${trabajo.id} enviado a impresión`);
      } catch (error) {
        console.error(`Error en trabajo #${trabajo.id}:`, error.message);
        await informarResultado(trabajo.id, false, error.message);
      }
    } catch (error) {
      console.error("Error inesperado en el ciclo:", error.message);
      await dormir(intervaloMs);
    }
  }
}

ciclo();
