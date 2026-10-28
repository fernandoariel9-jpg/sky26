/**
 * IPA de Sky26, versión inicial (catálogo clínico provisorio).
 * Fuente: Catálogos IPA/SLA (28-10-2026), riesgo por familia y
 * criticidad de servicio/subservicio.
 *
 * NO clasifica fallas, NO asigna SLA y NO realiza cambios en la base.
 * Los patrones de familia requieren validación de Ingeniería Clínica.
 * Si un dato es desconocido NO se le asigna cero: IPA queda null.
 */
export const normalizarIPA = (texto) =>
  String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().trim().replace(/\s+/g, " ");

const reglasFamilia = [
  [
    "EQUIPOS DE ENSAYO IC",
    2,
    "^(ANALIZADOR (DE |PARA )?(DESFIBRILADOR|RESPIRADOR|VENTILADOR|MONITOR|ELECTROBISTURI|SEGURIDAD ELECTRICA)|SIMULADOR DE PACIENTE)"
  ],
  [
    "COMPONENTES DE INCUBADORA",
    null,
    "^(MODULO (DE )?CONTROL INCUBADORA|HABITACULO INCUBADORA)"
  ],
  [
    "COMPONENTES DE MONITOREO",
    null,
    "^(MODULO .*MONITOR|PANTALLA MONITOR MULTIPARAM|MODULO DE CAPNOGRAFIA|MODULO ECG)"
  ],
  [
    "ACCESORIOS RX",
    null,
    "^(CPU DE ORTOPANTOMOGRAFO|FLAT PANEL|TUBO RX|COLIMADOR)"
  ],
  [
    "TRANSDUCTORES",
    null,
    "^TRANSDUCTOR"
  ],
  [
    "ALIMENTACION ELECTRICA",
    null,
    "^(UPS|ESTABILIZADOR|FUENTE (DE )?ALIMENTACION)\\b"
  ],
  [
    "FUENTES DE LUZ",
    null,
    "^FUENTE DE LUZ\\b"
  ],
  [
    "DETECTORES DE APNEA",
    9,
    "^DETECTOR DE APNEA\\b"
  ],
  [
    "RESUCITADORES NEONATALES",
    10,
    "^RESUCITADOR NEONATAL\\b"
  ],
  [
    "SOPORTE EXTRACORPOREO",
    10,
    "^(BOMBA EXTRACORPOREA|ECMO)\\b"
  ],
  [
    "CARDIODESFIBRILADORES",
    10,
    "^(CARDIO\\s?DESFIBRILADOR|DESFIBRILADOR DEA)\\b"
  ],
  [
    "RESPIRADORES",
    10,
    "^(RESPIRADOR|VENTILADOR MECANICO|VENTILADOR PULMONAR)\\b"
  ],
  [
    "ASISTENCIA RESPIRATORIA NO INVASIVA",
    9,
    "^(BIPAP|CPAP)\\b"
  ],
  [
    "MARCAPASOS",
    10,
    "^MARCAPASOS?\\b"
  ],
  [
    "ANESTESIA",
    10,
    "^(MESA DE ANESTESIA|MAQUINA DE ANESTESIA)\\b"
  ],
  [
    "VAPORIZACION ANESTESICA",
    9,
    "^VAPORIZADOR\\b"
  ],
  [
    "HEMODIALISIS",
    9,
    "^MAQUINA DE HEMODIALISIS\\b"
  ],
  [
    "BOMBAS DE MEDICACION",
    9,
    "^BOMBA(S)? (DE )?(INFUSION|JERINGA)\\b"
  ],
  [
    "MEZCLA DE GASES MEDICINALES",
    9,
    "^(BLENDER|MEZCLADOR AIRE/OXIGENO)\\b"
  ],
  [
    "INCUBACION Y TERMORREGULACION NEONATAL",
    9,
    "^(INCUBADORA NEONATAL|INCUBADORA DE TRANSPORTE|SERVOCUNA|CAFO)\\b"
  ],
  [
    "MONITOREO MULTIPARAMETRICO",
    9,
    "^(MONITOR MULTIPARAMETRICO|MONITOR CARDIACO|MONITOR DE ANESTESIA|MONITOR PIC|CENTRAL DE MONITOREO)\\b"
  ],
  [
    "OXIMETRIA Y SATURACION",
    8,
    "^(SATUROMETRO|OXIMETRO (DE PULSO|PORTATIL)|PULSIOXIMETRO)\\b"
  ],
  [
    "CAPNOGRAFIA",
    8,
    "^(CAPNOGRAFO|MONITOR CAPNOGRAFIA)\\b"
  ],
  [
    "SISTEMAS DE ASPIRACION",
    null,
    "^(ASPIRADOR|BOMBA SUCCION|BOMBA DE VACIO)\\b"
  ],
  [
    "ELECTROCIRUGIA",
    8,
    "^ELECTROBISTURI\\b"
  ],
  [
    "INSTRUMENTAL MOTORIZADO QUIRURGICO",
    7,
    "^(TALADRO QUIRURGICO|CONSOLA DE TALADRO QUIRURGICO|SIERRA ELECTRICA|MICROSIERRA|ELECTROSIERRA)\\b"
  ],
  [
    "FOTOTERAPIA",
    8,
    "^LAMPARA DE FOTOTERAPIA\\b"
  ],
  [
    "MONITOREO FETAL",
    8,
    "^(MONITOR FETAL|DETECTOR FETAL|DOPPLER FETAL)\\b"
  ],
  [
    "ECG Y HOLTER",
    7,
    "^(ELECTROCARDIOGRAFO|GRABADORA HOLTER|HOLTER|MAPA)\\b"
  ],
  [
    "DIAGNOSTICO POR RX",
    8,
    "^(EQUIPO DE RX|TOMOGRAFO|MAMOGRAFO|ORTOPANTOMOGRAFO|ARCO EN C)\\b"
  ],
  [
    "ECOGRAFIA",
    7,
    "^ECOGRAFO\\b"
  ],
  [
    "INYECCION DE CONTRASTE",
    8,
    "^BOMBA DE CONTRASTE\\b"
  ],
  [
    "ENDOSCOPIA",
    7,
    "^(VIDEOENDOSCOPIO|BRONCOFIBROSCOPIO|GASTROVIDEOENDOSCOPIO)\\b"
  ],
  [
    "ESTERILIZACION",
    8,
    "^(AUTOCLAVE|ESTERILIZADOR)\\b"
  ],
  [
    "HELADERAS FREEZERS",
    null,
    "^(HELADERA|FREEZER)\\b"
  ],
  [
    "LABORATORIO ANALITICO",
    6,
    "^(CENTRIFUGA|ANALIZADOR|CONTADOR HEMATOLOGICO|MICROSCOPIO|TERMOCICLADOR|LECTOR DE ELISA)\\b"
  ],
  [
    "BALANZAS",
    3,
    "^BALANZA\\b"
  ],
  [
    "TERMOMETRIA",
    4,
    "^TERMOMETRO\\b"
  ],
  [
    "COMPUTACION NO MEDICA",
    2,
    "^(CPU|NOTEBOOK|MONITOR PC|IMPRESORA)\\b"
  ],
  [
    "HUMIDIFICADORES",
    null,
    "^HUMIDIFICADOR\\b"
  ],
  [
    "BANOS TERMOSTATICOS",
    5,
    "^BANO TERMOSTATICO\\b"
  ],
  [
    "MICROPIPETAS",
    4,
    "^MICROPIPETA\\b"
  ],
  [
    "MOTORES COLCHON",
    5,
    "^MOTOR COLCHON\\b"
  ],
  [
    "CAMAS INTERNACION",
    5,
    "^CAMA (DE INTERNACION|DE ENDOSCOPIA)\\b"
  ],
  [
    "OFTALMOSCOPIOS Y OTOSCOPIOS",
    4,
    "^(OFTALMOSCOPIO|OTOSCOPIO|FRONTOLUZ)\\b"
  ],
  [
    "AGITADORES DE LABORATORIO",
    4,
    "^(AGITADOR|VORTEX)\\b"
  ],
  [
    "LAMPARAS SCIALITICAS",
    7,
    "^SCIALITICA\\b"
  ],
  [
    "IMPRESION VIDEO",
    2,
    "^(VIDEO PRINTER|IMPRESORA ECOGRAFO)\\b"
  ],
  [
    "MESAS CIRUGIA",
    8,
    "^MESA DE CIRUGIA\\b"
  ],
  [
    "ESTUFAS DE LABORATORIO",
    5,
    "^ESTUFA\\b"
  ],
  [
    "DETECTORES RX",
    null,
    "^(FLAT PANEL|TUBO RX|COLIMADOR)\\b"
  ],
  [
    "EXTRACTORAS DE LECHE",
    5,
    "^BOMBA EXTRACTORA DE LECHE\\b"
  ],
  [
    "TENSIOMETROS",
    5,
    "^(ESFIGMOMANOMETRO|TENSIOMETRO)\\b"
  ],
  [
    "ELECTROESTIMULACION",
    5,
    "^(ELECTROESTIMULADOR|MAGNETOTERAPIA)\\b"
  ],
  [
    "MICROONDAS",
    2,
    "^MICROONDAS\\b"
  ],
  [
    "PANTALLAS VIDEO",
    2,
    "^(MONITOR DE VIDEO|MONITOR LED FULL HD)\\b"
  ],
  [
    "TRANSPORTE NEUMATICO",
    5,
    "^TUBO DE TRANSPORTE\\b"
  ],
  [
    "INSTRUMENTAL GASA",
    2,
    "^CORTADOR DE GASA\\b"
  ],
  [
    "TERMOBLOQUES",
    5,
    "^(TERMOBLOQUE|HOT PLATE)\\b"
  ],
  [
    "NEBULIZADORES",
    6,
    "^NEBULIZADOR\\b"
  ],
  [
    "SELLADORAS",
    5,
    "^SELLADOR(A| DE TUBULADURAS)\\b"
  ],
  [
    "ELECTROFORESIS",
    6,
    "^ELECTROFORESIS\\b"
  ],
  [
    "BILIRRUBINOMETROS",
    7,
    "^BILIRRUBINOMETRO\\b"
  ],
  [
    "ENDOSCOPIOS FLEXIBLES",
    7,
    "^(COLONOSCOPIO|DUODENOSCOPIO)\\b"
  ],
  [
    "COMPRESORES AIRE",
    null,
    "^COMPRESOR DE AIRE\\b"
  ],
  [
    "ELECTROENCEFALOGRAFIA",
    6,
    "^ELECTROENCEFALOGRAFO\\b"
  ],
  [
    "CABINAS FLUJO LAMINAR",
    7,
    "^.*FLUJO LAMINAR\\b"
  ],
  [
    "SIERRA YESO",
    4,
    "^SIERRA PARA YESO\\b"
  ],
  [
    "REHABILITACION",
    4,
    "^(BICICLETA FIJA|ULTRASONIDO)\\b"
  ],
  [
    "LAVADO ELISA",
    5,
    "^LAVADOR DE ELISA\\b"
  ],
  [
    "LAMPARAS HENDIDURA",
    6,
    "^LAMPARA DE HENDIDURA\\b"
  ],
  [
    "IMPEDANCIOMETRIA",
    5,
    "^IMPEDANCIOMETRO\\b"
  ],
  [
    "MEDIDORES O2",
    6,
    "^MEDIDOR DE OXIGENO\\b"
  ],
  [
    "INCUBADOR LABORATORIO",
    5,
    "^(INCUBADOR|INCUBADORA CO2|INCUBADORA DE INDICADORES)\\b"
  ],
  [
    "ESPIROMETRIA",
    6,
    "^ESPIROMETRO\\b"
  ],
  [
    "LAMPARAS EXAMEN",
    4,
    "^LAMPARA DE EXAMINACION\\b"
  ],
  [
    "BOMBAS ALIMENTACION",
    7,
    "^BOMBA DE ALIMENTACION\\b"
  ],
  [
    "SILLAS Y MOVILIDAD",
    3,
    "^(SILLA DE RUEDAS|CAMILLA)\\b"
  ]
]
  .map(([familia, riesgo, patron]) => ({ familia, riesgo, regex: new RegExp(patron) }));

const riesgosServicio = new Map([
  [
    "NEONATOLOGIA",
    5
  ],
  [
    "CENTRO QUIRURGICO",
    5
  ],
  [
    "LABORATORIO CENTRAL",
    3
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    3
  ],
  [
    "TERAPIA PED.",
    5
  ],
  [
    "CLINICA MEDICA",
    3
  ],
  [
    "STI",
    5
  ],
  [
    "PEDIATRIA",
    3
  ],
  [
    "MATERNIDAD",
    4
  ],
  [
    "CARDIOLOGIA",
    4
  ],
  [
    "SMU",
    5
  ],
  [
    "ANATOMIA PATOLOGICA",
    3
  ],
  [
    "HEMATOLOGIA Y HEMOTERAPIA",
    4
  ],
  [
    "ANESTESIA",
    5
  ],
  [
    "HEMODIALISIS",
    5
  ],
  [
    "REHABILITACION",
    2
  ],
  [
    "OFTALMOLOGIA",
    2
  ],
  [
    "FONOAUDIOLOGIA",
    2
  ],
  [
    "CONSULTORIOS EXTERNOS",
    2
  ],
  [
    "FARMACIA",
    4
  ],
  [
    "GINECOLOGIA",
    3
  ],
  [
    "NEUROCIRUGIA",
    4
  ],
  [
    "ESTERILIZACION",
    4
  ],
  [
    "NUTRICION",
    3
  ],
  [
    "ORL",
    2
  ],
  [
    "TRAUMATOLOGIA",
    3
  ],
  [
    "CHAGAS",
    3
  ],
  [
    "CIRUGIA",
    4
  ],
  [
    "ENDOSCOPIA",
    4
  ],
  [
    "ONCOLOGIA INFANTIL",
    4
  ],
  [
    "CARDIOLOGIA INFANTIL",
    4
  ],
  [
    "VUELO SANITARIO",
    5
  ],
  [
    "INFORMATICA",
    1
  ],
  [
    "CONS. EXT.",
    2
  ],
  [
    "VACUNATORIO",
    3
  ],
  [
    "CIRUGIA PEDIATRICA",
    4
  ],
  [
    "KINESIOLOGIA",
    2
  ],
  [
    "NEUROLOGIA",
    3
  ],
  [
    "GASTROENTEROLOGIA",
    3
  ],
  [
    "PSIQUIATRIA",
    3
  ],
  [
    "AMBULANCIA",
    5
  ],
  [
    "TERAPIA PEDIATRICA",
    5
  ],
  [
    "LACTARIO INSTITUCIONAL",
    3
  ],
  [
    "HOGAR DE DIA",
    2
  ],
  [
    "CRECIMIENTO Y DESARROLLO",
    2
  ],
  [
    "CONSULTORIO DIVERSIDAD",
    2
  ],
  [
    "TESORERIA",
    1
  ],
  [
    "TRANSPLANTE",
    5
  ],
  [
    "AUDITORIA MEDICA",
    1
  ],
  [
    "LACTARIO SUBSUELO",
    3
  ],
  [
    "INTERNACION COVID 3 PISO",
    4
  ],
  [
    "INFECTOLOGIA",
    3
  ],
  [
    "PRENSA",
    1
  ],
  [
    "PROCURACION",
    4
  ],
  [
    "GUARDERIA",
    1
  ]
]);
const riesgosSubservicio = new Map([
  [
    "CARDIOLOGIA",
    "UCO",
    5
  ],
  [
    "CARDIOLOGIA",
    "ERGOMETRIA",
    3
  ],
  [
    "CARDIOLOGIA",
    "RECUPERACION CARDIOVASCULAR",
    5
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    "HEMODINAMIA",
    5
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    "TOMOGRAFIA",
    4
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    "TOMOGRAFIA PB",
    4
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    "TOMOGRAFIA SS",
    4
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    "RESONANCIA",
    4
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    "MAMOGRAFIA",
    3
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    "STI",
    5
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    "DI. UCO",
    5
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    "UCO",
    5
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    "TER. PED.",
    5
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    "NEO",
    5
  ],
  [
    "DIAGNOSTICO POR IMAGEN",
    "CENTRO QUIRURGICO",
    5
  ],
  [
    "NEONATOLOGIA",
    "UCIN",
    5
  ],
  [
    "NEONATOLOGIA",
    "INTERMEDIA",
    4
  ],
  [
    "NEONATOLOGIA",
    "TRANSICIONAL",
    4
  ],
  [
    "NEONATOLOGIA",
    "NEO UCIN",
    5
  ],
  [
    "NEONATOLOGIA",
    "NEO INTERMEDIA",
    4
  ],
  [
    "NEONATOLOGIA",
    "QUIROFANO",
    5
  ],
  [
    "TERAPIA PED.",
    "UTIP",
    5
  ],
  [
    "TERAPIA PED.",
    "UCIP",
    5
  ],
  [
    "PEDIATRIA",
    "EMERGENCIA",
    5
  ],
  [
    "PEDIATRIA",
    "UTIP",
    5
  ],
  [
    "SMU",
    "SHOCK ROOM",
    5
  ],
  [
    "SMU",
    "SMU QUIROFANO",
    5
  ],
  [
    "SMU",
    "QUIROFANO URGENCIAS",
    5
  ],
  [
    "CENTRO QUIRURGICO",
    "CQ. RECUPERACION",
    5
  ],
  [
    "CENTRO QUIRURGICO",
    "CQ. PASILLO",
    4
  ],
  [
    "MATERNIDAD",
    "CENTRO OBSTETRICO",
    5
  ],
  [
    "MATERNIDAD",
    "ALTO RIESGO",
    5
  ],
  [
    "MATERNIDAD",
    "MEDICINA FETAL",
    4
  ],
  [
    "LABORATORIO CENTRAL",
    "URGENCIAS",
    4
  ],
  [
    "CLINICA MEDICA",
    "ENDOSCOPIA",
    4
  ],
  [
    "CLINICA MEDICA",
    "NEUMONOLOGIA",
    3
  ],
  [
    "CLINICA MEDICA",
    "ONCOLOGIA",
    4
  ],
  [
    "HEMODIALISIS",
    "HEMODIALISIS",
    5
  ]
]
  .map(([servicio, subservicio, riesgo]) => [servicio + "|" + subservicio, riesgo]));

export function obtenerRiesgoClinico(descripcion) {
  const nombre = normalizarIPA(descripcion);
  if (!nombre) return null;
  const regla = reglasFamilia.find(({ regex }) => regex.test(nombre));
  return regla ? { familia: regla.familia, valor: regla.riesgo } : null;
}

export function obtenerCriticidadServicio(servicio, subservicio) {
  const claveServicio = normalizarIPA(servicio);
  if (!claveServicio) return null;
  const especifico = riesgosSubservicio.get(
    claveServicio + "|" + normalizarIPA(subservicio)
  );
  return especifico ?? riesgosServicio.get(claveServicio) ?? null;
}

/**
 * N = otros equipos con MISMA DESCRIPCIÓN en el MISMO SERVICIO
 * y estado exactamente ACTIVO. No se cuenta al propio equipo.
 * No implica disponibilidad clínica validada ni intercambio garantizado.
 */
export function calcularIPA({ descripcion, servicio, subservicio, respaldos }) {
  const riesgo = obtenerRiesgoClinico(descripcion);
  const criticidad = obtenerCriticidadServicio(servicio, subservicio);
  if (riesgo?.valor == null || criticidad == null ||
      !Number.isInteger(respaldos) || respaldos < 0) return null;

  const b = 10 / (1 + 0.25 * respaldos);
  const valor = 4.5 * riesgo.valor + 4 * criticidad + 3.5 * b;
  return {
    valor: Number(valor.toFixed(1)),
    factores: { riesgo_clinico: riesgo.valor, servicio: criticidad,
      falta_respaldo: Number(b.toFixed(2)) },
    familia: riesgo.familia,
    respaldos,
    version: "IPA-1"
  };
}
