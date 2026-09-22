const CAMPOS_ENTEROS_RESPUESTA = new Set([
  "cantidad",
  "stock_minimo",
  "disponible",
  "solicitado",
  "nueva_cantidad",
  "anterior",
  "diferencia"
]);

function convertirEnteros(valor) {
  if (Array.isArray(valor)) {
    return valor.map(convertirEnteros);
  }

  if (valor && typeof valor === "object") {
    const salida = {};
    for (const [clave, contenido] of Object.entries(valor)) {
      if (CAMPOS_ENTEROS_RESPUESTA.has(clave) && contenido !== null && contenido !== undefined && contenido !== "") {
        const numero = Number(contenido);
        salida[clave] = Number.isFinite(numero) ? Math.trunc(numero) : contenido;
      } else {
        salida[clave] = convertirEnteros(contenido);
      }
    }
    return salida;
  }

  return valor;
}

export function normalizarRespuestaStockEntera(req, res, next) {
  const jsonOriginal = res.json.bind(res);

  res.json = (body) => jsonOriginal(convertirEnteros(body));
  next();
}

export function validarCamposStockEnteros(campos = []) {
  return (req, res, next) => {
    for (const campo of campos) {
      if (!(campo in (req.body || {}))) continue;

      const valor = req.body[campo];
      if (valor === null || valor === undefined || valor === "") continue;

      const numero = Number(valor);
      if (!Number.isInteger(numero)) {
        return res.status(400).json({
          error: `${campo} debe ser un número entero`
        });
      }
    }

    next();
  };
}
