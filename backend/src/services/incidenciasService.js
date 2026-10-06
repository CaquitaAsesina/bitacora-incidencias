/**
 * =====================================================================
 * services/incidenciasService.js — Lógica de la bitácora
 * =====================================================================
 * Módulo alineado con schema.sql vigente:
 *   - SIN `tipo_centro` (columna eliminada del schema).
 *   - SIN `usuario_id`: la trazabilidad vive en `creado_por` (quién la registró)
 *     y `actualizado_por` (quién la tocó por última vez). Ambas son FK a
 *     usuarios con ON DELETE RESTRICT.
 *   - Índices disponibles y cómo los usa este archivo:
 *       idx_incidencias_fecha_tipo        (fecha, incidencia)
 *       idx_incidencias_centro_fecha      (centro, fecha)
 *       idx_incidencias_sistema_fecha     (sistema, fecha)
 *       idx_incidencias_responsable_fecha (responsable, fecha)
 *       idx_incidencias_hora_fin_fecha    (hora_fin, fecha)
 *       idx_incidencias_creado_por        (creado_por)
 *       idx_incidencias_actualizado_por   (actualizado_por)
 *
 * DECISIÓN DE ÍNDICES (importante):
 *   Los índices compuestos son (columna_filtro, fecha). Por eso los filtros de
 *   centro/sistema/incidencia/responsable son de IGUALDAD EXACTA (`=`), nunca
 *   `LIKE '%texto%'`: un comodín inicial anula el índice y obliga a escanear.
 *   La búsqueda libre la cubre el parámetro `q`, que sí es un LIKE con comodín
 *   inicial, y por eso está aislado del camino indexado.
 *   El filtro de estado usa `hora_fin IS [NOT] NULL`, que es exactamente el
 *   prefijo de idx_incidencias_hora_fin_fecha.
 *
 * Para extender: cualquier regla sobre incidencias (campos nuevos, cálculos de
 * tiempos, estados) debe vivir en este archivo.
 * =====================================================================
 */
import pool from '../config/db.js';

/** Columnas de la incidencia + los dos usuarios de auditoría (LEFT JOIN). */
const SELECT_INCIDENCIA = `
  i.id,
  i.centro,
  i.sistema,
  i.incidencia,
  i.ticket,
  i.responsable,
  i.descripcion,
  i.fecha,
  i.hora_inicio,
  i.hora_fin,
  i.tiempo_solucion,
  i.creado_por,
  i.actualizado_por,
  i.creado_en,
  i.actualizado_en,
  COALESCE(uc.usuario, CAST(i.creado_por AS CHAR))              AS creado_por_usuario,
  CONCAT_WS(' ', uc.nombre, uc.apellido)                       AS creado_por_nombre,
  COALESCE(ua.usuario, CAST(i.actualizado_por AS CHAR))        AS actualizado_por_usuario,
  CONCAT_WS(' ', ua.nombre, ua.apellido)                       AS actualizado_por_nombre
`;

/** JOIN de auditoría. Reutilizado por el listado y por el detalle. */
const JOINS_AUDITORIA = `
  LEFT JOIN usuarios uc ON uc.id = i.creado_por
  LEFT JOIN usuarios ua ON ua.id = i.actualizado_por
`;

/**
 * Ordenamientos permitidos. Cada entrada se elige para aprovechar un índice:
 *   - `fecha*`  -> prefijo de idx_incidencias_fecha_tipo
 *   - `centro*` -> prefijo de idx_incidencias_centro_fecha
 *   - `sistema*`-> prefijo de idx_incidencias_sistema_fecha
 *   - `incidencia*` -> prefijo de idx_incidencias_fecha_tipo (2ª columna)
 *   - `responsable*`-> prefijo de idx_incidencias_responsable_fecha
 *   - `hora_fin*` -> prefijo de idx_incidencias_hora_fin_fecha
 * El `id` de desempate siempre acompaña: hace la ordenación estable entre
 * páginas (sin él, LIMIT/OFFSET puede repetir o saltar filas).
 */
const ORDENES_PERMITIDOS = {
  fecha_desc: 'i.fecha DESC, i.id DESC',
  fecha_asc: 'i.fecha ASC, i.id ASC',
  centro_asc: 'i.centro ASC, i.fecha DESC, i.id DESC',
  centro_desc: 'i.centro DESC, i.fecha DESC, i.id DESC',
  sistema_asc: 'i.sistema ASC, i.fecha DESC, i.id DESC',
  sistema_desc: 'i.sistema DESC, i.fecha DESC, i.id DESC',
  incidencia_asc: 'i.incidencia ASC, i.fecha DESC, i.id DESC',
  incidencia_desc: 'i.incidencia DESC, i.fecha DESC, i.id DESC',
  responsable_asc: 'i.responsable ASC, i.fecha DESC, i.id DESC',
  responsable_desc: 'i.responsable DESC, i.fecha DESC, i.id DESC',
  hora_fin_desc: 'i.hora_fin DESC, i.fecha DESC, i.id DESC',
  hora_fin_asc: 'i.hora_fin ASC, i.fecha DESC, i.id DESC',
  hora_inicio_desc: 'i.hora_inicio DESC, i.fecha DESC, i.id DESC',
  ticket_asc: 'i.ticket ASC',
  ticket_desc: 'i.ticket DESC',
  tiempo_solucion_desc: 'i.tiempo_solucion DESC, i.fecha DESC, i.id DESC',
  tiempo_solucion_asc: 'i.tiempo_solucion ASC, i.fecha DESC, i.id DESC',
  // Auditoría: idx_incidencias_creado_por / idx_incidencias_actualizado_por.
  creado_en_desc: 'i.creado_en DESC, i.id DESC',
  creado_en_asc: 'i.creado_en ASC, i.id ASC',
  creado_por_asc: 'i.creado_por ASC, i.creado_en DESC, i.id DESC',
  creado_por_desc: 'i.creado_por DESC, i.creado_en DESC, i.id DESC',
  actualizado_en_desc: 'i.actualizado_en DESC, i.id DESC',
  actualizado_en_asc: 'i.actualizado_en ASC, i.id ASC',
};

/** Nombres de ordenamiento que puede consumir el frontend. */
export const ORDENES_INCIDENCIAS = Object.keys(ORDENES_PERMITIDOS);

/** Campos de texto sobre los que actúa la búsqueda libre `q`. */
const COLUMNAS_BUSQUEDA_LIBRE = [
  'i.ticket',
  'i.descripcion',
  'i.centro',
  'i.sistema',
  'i.incidencia',
  'i.responsable',
];

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Construye el WHERE una sola vez y lo reutiliza en el SELECT y en el COUNT.
 * Antes se duplicaba el bloque de filtros en dos cadenas; cualquier campo nuevo
 * tenía que escribirse dos veces (y era fácil olvidar una, desincronizando el
 * total con la lista).
 *
 * @param {object} filtros
 * @returns {{ sql: string, params: any[] }} sql con el "WHERE 1=1" y sus "AND"
 */
function construirFiltros(filtros = {}) {
  let sql = '';
  const params = [];

  // --- Rango de fechas: prefijo de idx_incidencias_fecha_tipo -------------
  const desde = REGEX_FECHA.test(String(filtros.fecha_desde || '').trim())
    ? String(filtros.fecha_desde).trim()
    : '';
  const hasta = REGEX_FECHA.test(String(filtros.fecha_hasta || '').trim())
    ? String(filtros.fecha_hasta).trim()
    : '';

  if (desde && hasta) {
    // Rango invertido: se corrige intercambiando los límites.
    const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    sql += ' AND i.fecha BETWEEN ? AND ?';
    params.push(a, b);
  } else if (desde) {
    sql += ' AND i.fecha >= ?';
    params.push(desde);
  } else if (hasta) {
    sql += ' AND i.fecha <= ?';
    params.push(hasta);
  }

  // --- Filtros de igualdad exacta: hit de prefijo de los índices compuestos -
  // centro      -> idx_incidencias_centro_fecha (centro, fecha)
  // sistema     -> idx_incidencias_sistema_fecha (sistema, fecha)
  // incidencia  -> idx_incidencias_fecha_tipo (fecha, incidencia)
  // responsable -> idx_incidencias_responsable_fecha (responsable, fecha)
  for (const campo of ['centro', 'sistema', 'incidencia', 'responsable']) {
    const valor = limpiarTexto(filtros[campo]);
    if (valor) {
      sql += ` AND i.${campo} = ?`;
      params.push(valor);
    }
  }

  // --- Estado: prefijo de idx_incidencias_hora_fin_fecha (hora_fin, fecha) -
  if (filtros.estado === 'abierta') {
    sql += ' AND i.hora_fin IS NULL';
  } else if (filtros.estado === 'cerrada') {
    sql += ' AND i.hora_fin IS NOT NULL';
  }

  // --- Autores: idx_incidencias_creado_por / idx_incidencias_actualizado_por
  const creadoPor = enteroOpcional(filtros.creado_por);
  if (creadoPor !== null) {
    sql += ' AND i.creado_por = ?';
    params.push(creadoPor);
  }
  const actualizadoPor = enteroOpcional(filtros.actualizado_por);
  if (actualizadoPor !== null) {
    sql += ' AND i.actualizado_por = ?';
    params.push(actualizadoPor);
  }

  // --- Horas exactas (no indexadas: se filtran sobre el rango ya acotado) --
  const horaInicio = limpiarTexto(filtros.hora_inicio);
  if (/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(horaInicio)) {
    sql += ' AND i.hora_inicio = ?';
    params.push(normalizarHora(horaInicio));
  }
  const horaFin = limpiarTexto(filtros.hora_fin);
  if (/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(horaFin)) {
    sql += ' AND i.hora_fin = ?';
    params.push(normalizarHora(horaFin));
  }

  // --- Búsqueda libre: NO indexada a propósito (LIKE con % inicial) ----------
  const q = limpiarTexto(filtros.q);
  if (q) {
    const patron = `%${q}%`;
    sql += ` AND (${COLUMNAS_BUSQUEDA_LIBRE.map((c) => `${c} LIKE ?`).join(' OR ')})`;
    for (let i = 0; i < COLUMNAS_BUSQUEDA_LIBRE.length; i++) params.push(patron);
  }

  return { sql, params };
}

/** Recorta y colapsa espacios. Devuelve '' si no queda nada utilizable. */
function limpiarTexto(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim().replace(/\s+/g, ' ');
}

/** Convierte a entero si es un entero válido; si no, null (filtro ignorado). */
function enteroOpcional(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Normaliza HH:MM o HH:MM:SS a HH:MM:SS (formato de la columna TIME). */
function normalizarHora(valor) {
  const partes = String(valor).trim().split(':');
  if (partes.length < 2) return valor;
  const hh = partes[0].padStart(2, '0');
  const mm = partes[1].padStart(2, '0');
  const ss = (partes[2] || '00').slice(0, 2).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Traduce el parámetro `orden` a una cláusula ORDER BY de la lista blanca. */
function resolverOrden(orden) {
  return ORDENES_PERMITIDOS[orden] || ORDENES_PERMITIDOS.fecha_desc;
}

/** Valida longitud de un campo de texto contra el VARCHAR del schema. */
function textoOpcional(valor, max, campo) {
  const texto = limpiarTexto(valor);
  if (!texto) {
    const error = new Error(`El campo ${campo} es obligatorio`);
    error.statusCode = 400;
    throw error;
  }
  if (texto.length > max) {
    const error = new Error(`El campo ${campo} no puede superar ${max} caracteres`);
    error.statusCode = 400;
    throw error;
  }
  return texto;
}

/**
 * MÓDULO INCIDENCIAS — REGLAS CRÍTICAS
 * - creado_por y actualizado_por SIEMPRE salen de la sesión (nunca del body).
 * - fecha, hora_inicio, creado_en, actualizado_en -> MySQL (DEFAULT / ON UPDATE).
 * - hora_fin y tiempo_solucion -> NULL al crear; los pone el backend al cerrar.
 * - Al modificar cualquier campo se refresca actualizado_por (auditoría real).
 * - Al cerrar: hora_fin = hora del servidor (o la enviada) y
 *   tiempo_solucion = hora_fin - hora_inicio con cruce de medianoche.
 * - `responsable` (texto libre) es un dato del negocio: NO se toca al cerrar.
 */

/**
 * Lista incidencias con filtros, orden y paginación.
 * @param {object} filtros fecha_desde, fecha_hasta, centro, sistema, incidencia,
 *   responsable, estado (abierta|cerrada), creado_por, actualizado_por,
 *   hora_inicio, hora_fin, q, orden
 * @param {number|string} page
 * @param {number|string} limit
 * @param {{ contarPorEstado?: boolean }} opciones
 *   `contarPorEstado` añade el resumen abiertas/cerradas al resultado. Se pide
 *   solo cuando el listado NO viene filtrado por estado, porque en ese caso los
 *   totales por estado ya no son comparables con las filas mostradas. La
 *   consulta va en el mismo Promise.all, así que no encarece el viaje.
 * @returns {Promise<{ data: object[], pagination: object, filtros_aplicados: object }>}
 */
export async function listarIncidencias(filtros = {}, page = 1, limit = 10, opciones = {}) {
  const pagina = Math.max(parseInt(page, 10) || 1, 1);
  const limite = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 200);
  const offset = (pagina - 1) * limite;

  const { sql: where, params } = construirFiltros(filtros);
  const orden = resolverOrden(filtros.orden);

  // Rendimiento: el listado, el conteo y el resumen de estados son
  // independientes -> un solo viaje de red en lugar de dos o tres ida y vuelta.
  const [resultadoListado, resultadoTotal, resultadoEstado] = await Promise.all([
    pool.query(
      `SELECT ${SELECT_INCIDENCIA}
       FROM incidencias i
       ${JOINS_AUDITORIA}
       WHERE 1=1${where}
       ORDER BY ${orden}
       LIMIT ? OFFSET ?`,
      [...params, limite, offset]
    ),
    pool.query(`SELECT COUNT(*) AS total FROM incidencias i WHERE 1=1${where}`, params),
    opciones.contarPorEstado
      ? pool.query(
          `SELECT COUNT(*) AS total,
                  SUM(i.hora_fin IS NULL) AS abiertas,
                  SUM(i.hora_fin IS NOT NULL) AS cerradas
           FROM incidencias i
           WHERE 1=1${construirFiltros({ ...filtros, estado: undefined }).sql}`,
          construirFiltros({ ...filtros, estado: undefined }).params
        )
      : Promise.resolve(null),
  ]);

  const [rows] = resultadoListado;
  const [totalRows] = resultadoTotal;
  const total = Number(totalRows[0].total) || 0;

  const respuesta = {
    data: rows,
    pagination: {
      page: pagina,
      limit: limite,
      total,
      totalPages: Math.max(Math.ceil(total / limite), 1),
    },
    filtros_aplicados: {
      ...filtros,
      orden: ORDENES_PERMITIDOS[filtros.orden] ? filtros.orden : 'fecha_desc',
    },
  };

  if (resultadoEstado) {
    const [filaEstado] = resultadoEstado;
    const abiertas = Number(filaEstado[0].abiertas) || 0;
    respuesta.estado = {
      total: Number(filaEstado[0].total) || 0,
      abiertas,
      cerradas: (Number(filaEstado[0].total) || 0) - abiertas,
    };
  }

  return respuesta;
}

/**
 * @param {number|string} id
 * @returns {Promise<object|null>} la incidencia completa (con autores) o null.
 */
export async function obtenerIncidenciaPorId(id) {
  const [rows] = await pool.query(
    `SELECT ${SELECT_INCIDENCIA}
     FROM incidencias i
     ${JOINS_AUDITORIA}
     WHERE i.id = ?`,
    [id]
  );

  return rows.length === 0 ? null : rows[0];
}

/**
 * Crea una incidencia. La auditoría la pone la sesión, nunca el body.
 * @param {object} data centro, sistema, incidencia, ticket, responsable, descripcion
 * @param {number} usuarioIdSesion
 * @throws {Error} 400 campo inválido o demasiado largo, 409 ticket duplicado.
 */
export async function crearIncidencia(data, usuarioIdSesion) {
  const payload = {
    centro: textoOpcional(data.centro, 50, 'centro'),
    sistema: textoOpcional(data.sistema, 50, 'sistema'),
    incidencia: textoOpcional(data.incidencia, 50, 'incidencia'),
    ticket: textoOpcional(data.ticket, 59, 'ticket'),
    responsable: textoOpcional(data.responsable, 60, 'responsable'),
    descripcion: textoOpcional(data.descripcion, 255, 'descripcion'),
  };

  // uq_incidencias_ticket es UNIQUE: se comprueba para devolver 409 con un
  // mensaje claro en lugar del error 1062 crudo de MySQL.
  const [ticketRows] = await pool.query('SELECT id FROM incidencias WHERE ticket = ?', [
    payload.ticket,
  ]);
  if (ticketRows.length > 0) {
    const error = new Error('El ticket ya existe');
    error.statusCode = 409;
    throw error;
  }

  // fecha, hora_inicio, creado_en, actualizado_en -> MySQL por DEFAULT.
  // hora_fin y tiempo_solucion quedan NULL (incidencia abierta).
  const [result] = await pool.query(
    `INSERT INTO incidencias
       (centro, sistema, incidencia, ticket, responsable, descripcion, creado_por, actualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.centro,
      payload.sistema,
      payload.incidencia,
      payload.ticket,
      payload.responsable,
      payload.descripcion,
      usuarioIdSesion,
      usuarioIdSesion,
    ]
  );

  return obtenerIncidenciaPorId(result.insertId);
}

/**
 * Cierra una incidencia: hora_fin = la indicada o la hora del servidor, y
 * tiempo_solucion = hora_fin - hora_inicio.
 * @param {{ hora_fin?: string }} opciones
 * @throws {Error} 404 inexistente, 409 ya cerrada.
 */
export async function cerrarIncidencia(id, usuarioIdSesion, opciones = {}) {
  const [rows] = await pool.query(
    'SELECT hora_inicio, hora_fin FROM incidencias WHERE id = ?',
    [id]
  );

  if (rows.length === 0) {
    const error = new Error('Incidencia no encontrada');
    error.statusCode = 404;
    throw error;
  }

  if (rows[0].hora_fin !== null) {
    const error = new Error('La incidencia ya está cerrada');
    error.statusCode = 409;
    throw error;
  }

  // Hora de fin y tiempo_solucion se resuelven en UNA consulta.
  const { hora_fin: horaFin, tiempo_solucion: tiempoSolucion } = await resolverHoraFinYTiempoSolucion(
    opciones.hora_fin || null,
    rows[0].hora_inicio
  );

  await pool.query(
    `UPDATE incidencias
     SET hora_fin = ?, tiempo_solucion = ?, actualizado_por = ?
     WHERE id = ?`,
    [horaFin, tiempoSolucion, usuarioIdSesion, id]
  );

  return obtenerIncidenciaPorId(id);
}

/**
 * Calcula tiempo_solucion = horaFin - horaInicio en formato HH:MM:SS.
 * Si el resultado es negativo (cruce de medianoche), suma 24 horas.
 */
async function calcularTiempoSolucion(horaFin, horaInicio) {
  const [rows] = await pool.query(
    'SELECT SEC_TO_TIME(MOD(TIME_TO_SEC(TIMEDIFF(?, ?)) + 86400, 86400)) AS tiempo_solucion',
    [horaFin, horaInicio]
  );
  return rows[0].tiempo_solucion;
}

/**
 * Resuelve en una sola consulta la hora de fin (la indicada, o la hora actual
 * del servidor si llega null) y su tiempo_solucion (con cruce de medianoche).
 * @returns {Promise<{ hora_fin: string, tiempo_solucion: string }>}
 */
async function resolverHoraFinYTiempoSolucion(horaFin, horaInicio) {
  const [rows] = await pool.query(
    `SELECT h.hora_fin,
            SEC_TO_TIME(MOD(TIME_TO_SEC(TIMEDIFF(h.hora_fin, ?)) + 86400, 86400)) AS tiempo_solucion
     FROM (SELECT COALESCE(?, CURTIME()) AS hora_fin) AS h`,
    [horaInicio, horaFin]
  );
  return rows[0];
}

/** Campos de incidencias editables (los tiempos se resuelven aparte). */
const CAMPOS_EDITABLES = ['centro', 'sistema', 'incidencia', 'responsable', 'descripcion'];

/** Longitud máxima de cada campo editable, taken del schema. */
const MAXIMOS_EDITABLES = {
  centro: 50,
  sistema: 50,
  incidencia: 50,
  responsable: 60,
  descripcion: 255,
  ticket: 59,
};

/**
 * Modifica los campos editables de una incidencia y, opcionalmente, la cierra.
 * - fecha y hora_inicio son editables.
 * - Si `cerrar` es true: fija hora_fin (o la hora actual del servidor si no
 *   llega) y calcula tiempo_solucion con la hora de inicio de ESTA petición.
 * - Si ya está cerrada y llega hora_fin, se corrige y se recalcula.
 * - Toda modificación refresca actualizado_por con el usuario de la sesión.
 */
export async function actualizarIncidencia(id, data, usuarioIdSesion) {
  const incidencia = await obtenerIncidenciaPorId(id);

  if (!incidencia) {
    const error = new Error('Incidencia no encontrada');
    error.statusCode = 404;
    throw error;
  }

  const updates = [];
  const params = [];

  for (const campo of CAMPOS_EDITABLES) {
    if (data[campo] !== undefined) {
      updates.push(`${campo} = ?`);
      params.push(textoOpcional(data[campo], MAXIMOS_EDITABLES[campo], campo));
    }
  }

  if (data.ticket !== undefined && limpiarTexto(data.ticket) !== incidencia.ticket) {
    const nuevoTicket = textoOpcional(data.ticket, MAXIMOS_EDITABLES.ticket, 'ticket');
    const [dup] = await pool.query('SELECT id FROM incidencias WHERE ticket = ? AND id != ?', [
      nuevoTicket,
      id,
    ]);
    if (dup.length > 0) {
      const error = new Error('El ticket ya existe');
      error.statusCode = 409;
      throw error;
    }
    updates.push('ticket = ?');
    params.push(nuevoTicket);
  }

  // Hora de inicio efectiva: si esta misma petición la modifica, el cálculo de
  // tiempo_solucion debe usar la nueva, no la guardada.
  const horaInicioEfectiva = data.hora_inicio
    ? normalizarHora(data.hora_inicio)
    : incidencia.hora_inicio;

  if (data.fecha !== undefined) {
    if (!REGEX_FECHA.test(String(data.fecha).trim())) {
      const error = new Error('Fecha inválida (se espera AAAA-MM-DD)');
      error.statusCode = 400;
      throw error;
    }
    updates.push('fecha = ?');
    params.push(String(data.fecha).trim());
  }

  if (data.hora_inicio !== undefined && normalizarHora(data.hora_inicio) !== incidencia.hora_inicio) {
    updates.push('hora_inicio = ?');
    params.push(horaInicioEfectiva);
  }

  if (data.cerrar) {
    if (incidencia.hora_fin !== null) {
      const error = new Error('La incidencia ya está cerrada');
      error.statusCode = 409;
      throw error;
    }

    const { hora_fin: horaFin, tiempo_solucion: tiempoSolucion } =
      await resolverHoraFinYTiempoSolucion(data.hora_fin || null, horaInicioEfectiva);

    updates.push('hora_fin = ?', 'tiempo_solucion = ?');
    params.push(horaFin, tiempoSolucion);
  } else if (data.hora_fin) {
    const horaFinNueva = normalizarHora(data.hora_fin);
    // Incidencia ya cerrada: se permite corregir la hora de fin y se
    // recalcula tiempo_solucion con la hora de inicio efectiva.
    updates.push('hora_fin = ?', 'tiempo_solucion = ?');
    params.push(horaFinNueva, await calcularTiempoSolucion(horaFinNueva, horaInicioEfectiva));
  }

  if (updates.length === 0) {
    return incidencia;
  }

  // Auditoría: la última modificación siempre lleva la firma de la sesión.
  updates.push('actualizado_por = ?');
  params.push(usuarioIdSesion, id);

  await pool.query(`UPDATE incidencias SET ${updates.join(', ')} WHERE id = ?`, params);

  return obtenerIncidenciaPorId(id);
}

/**
 * Elimina una incidencia.
 * @throws {Error} 404 si no existe.
 */
export async function eliminarIncidencia(id) {
  const [rows] = await pool.query('SELECT id FROM incidencias WHERE id = ?', [id]);
  if (rows.length === 0) {
    const error = new Error('Incidencia no encontrada');
    error.statusCode = 404;
    throw error;
  }
  await pool.query('DELETE FROM incidencias WHERE id = ?', [id]);
  return true;
}

/**
 * Valores distintos ya registrados, para los desplegables y el autocompletado.
 *
 * Antes era un `SELECT DISTINCT centro, sistema, ...` sobre las cuatro columnas
 * a la vez: MySQL tenía que materializar el producto cartesiano de las
 * combinaciones existentes y filtrar en memoria. Ahora son cuatro consultas
 * separadas en paralelo; cada DISTINCT puede recorrer un índice distinto
 * (idx_incidencias_centro_fecha, idx_incidencias_sistema_fecha,
 * idx_incidencias_fecha_tipo, idx_incidencias_responsable_fecha) y devolver
 * solo los valores distintos ordenados.
 *
 * Además devuelve `creadores` (autores reales, no texto libre) y el rango de
 * fechas con datos, para que el frontend no tenga que inventar filtros.
 */
export async function obtenerValoresSugeridos() {
  const [centros, sistemas, incidencias, responsables, autores, rango] = await Promise.all([
    pool.query(
      `SELECT DISTINCT centro AS valor FROM incidencias
       WHERE centro IS NOT NULL AND TRIM(centro) <> '' ORDER BY valor`
    ),
    pool.query(
      `SELECT DISTINCT sistema AS valor FROM incidencias
       WHERE sistema IS NOT NULL AND TRIM(sistema) <> '' ORDER BY valor`
    ),
    pool.query(
      `SELECT DISTINCT incidencia AS valor FROM incidencias
       WHERE incidencia IS NOT NULL AND TRIM(incidencia) <> '' ORDER BY valor`
    ),
    pool.query(
      `SELECT DISTINCT responsable AS valor FROM incidencias
       WHERE responsable IS NOT NULL AND TRIM(responsable) <> '' ORDER BY valor`
    ),
    pool.query(
      `SELECT DISTINCT i.creado_por AS id,
              COALESCE(u.usuario, CAST(i.creado_por AS CHAR)) AS usuario,
              CONCAT_WS(' ', u.nombre, u.apellido) AS nombre
       FROM incidencias i
       LEFT JOIN usuarios u ON u.id = i.creado_por
       ORDER BY nombre`
    ),
    pool.query('SELECT MIN(fecha) AS desde, MAX(fecha) AS hasta FROM incidencias'),
  ]);

  return {
    centro: centros[0].map((r) => r.valor),
    sistema: sistemas[0].map((r) => r.valor),
    incidencia: incidencias[0].map((r) => r.valor),
    responsable: responsables[0].map((r) => r.valor),
    creadores: autores[0],
    rango_fechas: rango[0][0] || { desde: null, hasta: null },
  };
}

/**
 * Resumen de estados para el badge del listado (abierta/cerrada).
 * Usa el prefijo de idx_incidencias_hora_fin_fecha.
 */
export async function contarPorEstado(filtros = {}) {
  const { sql, params } = construirFiltros({ ...filtros, estado: undefined });
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(i.hora_fin IS NULL) AS abiertas,
            SUM(i.hora_fin IS NOT NULL) AS cerradas
     FROM incidencias i WHERE 1=1${sql}`,
    params
  );
  const total = Number(rows[0].total) || 0;
  const abiertas = Number(rows[0].abiertas) || 0;
  return { total, abiertas, cerradas: total - abiertas };
}

export default {
  listarIncidencias,
  obtenerIncidenciaPorId,
  obtenerValoresSugeridos,
  contarPorEstado,
  crearIncidencia,
  actualizarIncidencia,
  cerrarIncidencia,
  eliminarIncidencia,
  ORDENES_INCIDENCIAS,
};
