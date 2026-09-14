// -----------------------------------------------------
// sky26AgentController.js
// Último snapshot recibido desde agentes locales Sky26
// -----------------------------------------------------

const snapshots = new Map();

function obtenerToken(req) {
  return req.headers["x-agent-token"] || "";
}

function validarToken(req, res) {
  const tokenEsperado = process.env.SKY26_AGENT_TOKEN;

  if (!tokenEsperado) {
    res.status(503).json({
      ok: false,
      error: "SKY26_AGENT_TOKEN no está configurado en el backend"
    });
    return false;
  }

  if (obtenerToken(req) !== tokenEsperado) {
    res.status(401).json({
      ok: false,
      error: "Token de agente inválido"
    });
    return false;
  }

  return true;
}

export function publicarSnapshot(req, res) {
  if (!validarToken(req, res)) return;

  const {
    agente = "ingenieria-clinica",
    instrumento = "citrex-h5",
    datos
  } = req.body || {};

  if (!Array.isArray(datos)) {
    return res.status(400).json({
      ok: false,
      error: "datos debe ser un arreglo de mediciones"
    });
  }

  const clave = `${agente}:${instrumento}`;
  const recibidoEn = new Date().toISOString();

  snapshots.set(clave, {
    agente,
    instrumento,
    recibidoEn,
    datos
  });

  return res.json({
    ok: true,
    agente,
    instrumento,
    recibidoEn,
    mediciones: datos.length
  });
}

export function obtenerUltimoSnapshot(req, res) {
  const agente = req.query.agente || "ingenieria-clinica";
  const instrumento = req.query.instrumento || "citrex-h5";
  const clave = `${agente}:${instrumento}`;

  const snapshot = snapshots.get(clave);

  if (!snapshot) {
    return res.status(404).json({
      ok: false,
      error: "Todavía no hay mediciones publicadas por el agente"
    });
  }

  return res.json({
    ok: true,
    ...snapshot
  });
}

export function estadoAgent(req, res) {
  const agente = req.query.agente || "ingenieria-clinica";
  const instrumento = req.query.instrumento || "citrex-h5";
  const clave = `${agente}:${instrumento}`;
  const snapshot = snapshots.get(clave);

  return res.json({
    ok: true,
    conectado: Boolean(snapshot),
    agente,
    instrumento,
    ultimaLectura: snapshot?.recibidoEn || null
  });
}
