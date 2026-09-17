# Sky26 Print Server

Agente local para Windows que toma trabajos desde la cola de Sky26 y los imprime en las impresoras instaladas en la PC.

## Primera etapa

- PDF A4 -> HP LaserJet Pro M404-M405 PCL
- Honeywell PC42T Plus reservada para la segunda etapa (etiquetas)

## 1. Backend

Ejecutar en PostgreSQL el archivo:

`sql/crear_impresiones.sql`

En Render agregar una variable de entorno:

`PRINT_SERVER_TOKEN`

Usar un valor largo y aleatorio. El mismo valor debe colocarse luego en `print-server/config.json`.

## 2. PC de impresión

Instalar:

- Node.js LTS
- SumatraPDF
- Driver de Windows de la HP LaserJet Pro M404-M405 PCL

Verificar el nombre exacto de la impresora con:

```bat
"C:\Program Files\SumatraPDF\SumatraPDF.exe" -list-printers
```

## 3. Configuración

Dentro de `print-server`:

1. Copiar `config.example.json` como `config.json`.
2. Completar el token.
3. Confirmar la ruta de SumatraPDF.
4. Confirmar el nombre exacto de la HP según Windows.

Ejemplo:

```json
{
  "backend": "https://sky26.onrender.com",
  "token": "TOKEN_SECRETO",
  "equipo": "pc-ingenieria-clinica",
  "intervalo_ms": 5000,
  "sumatra": "C:/Program Files/SumatraPDF/SumatraPDF.exe",
  "impresoras": {
    "laser": {
      "nombre": "HP LaserJet Pro M404-M405 PCL"
    },
    "etiquetas": {
      "nombre": "Honeywell PC42T Plus"
    }
  }
}
```

## 4. Instalación

Abrir una consola en `print-server` y ejecutar:

```bat
npm install
npm start
```

Debe aparecer algo similar a:

```text
Sky26 Print Server iniciado
Equipo: pc-ingenieria-clinica
Backend: https://sky26.onrender.com
Impresora láser: HP LaserJet Pro M404-M405 PCL
```

## 5. Prueba manual

Crear un trabajo desde cualquier cliente HTTP:

```http
POST https://sky26.onrender.com/api/stock/impresiones
Content-Type: application/json
```

```json
{
  "tipo": "pdf",
  "impresora": "laser",
  "documento_url": "https://sky26.onrender.com/equipos/NUMERO_SERIE/historial/pdf",
  "copias": 1,
  "solicitado_por": "prueba"
}
```

El agente toma el trabajo, descarga el PDF temporalmente, lo envía a la HP y luego elimina el archivo temporal.

## Estados de la cola

- `pendiente`
- `imprimiendo`
- `impreso`
- `error`

## Seguridad

Los endpoints utilizados por el agente (`siguiente`, `finalizar` y `heartbeat`) requieren el header privado `x-print-token`. El token nunca debe colocarse en el frontend.
