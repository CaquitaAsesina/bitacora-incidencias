/**
 * =====================================================================
 * services/incidenciasService.js — Lógica de la bitácora
 * =====================================================================
 * Listado/filtros, detalle, alta, modificación/cierre y borrado de incidencias,
 * además del cálculo de los valores sugeridos para autocompletado.
 *
 * Para extender: cualquier regla sobre incidencias (estados, campos nuevos,
 * cálculos de tiempos, etc.) debe vivir en este archivo.
 * =====================================================================
 */
import pool from '../config/db.js';

/**
 * MÓDULO INCIDENCIAS
 * 
 * REGLAS CRÍTICAS:
 * - Al crear: usuario_id = sesion.id (nunca viene del body). responsable = texto libre del body.
 * - Al crear: fecha, hora_inicio, creado_en, actualizado_en -> MySQL (DEFAULT/ON UPDATE). 
 * - hora_fin, tiempo_solucion -> NULL al crear.
 * - Al modificar: fecha y hora_inicio son editables; hora_fin también y se recalcula tiempo_solucion.
 * - Al cerrar: hora_fin = hora actual servidor. tiempo_solucion = HH:MM:SS (hora_fin - hora_inicio).
 * - Si sesion.id !== usuario_id -> usuario_id = sesion.id (sobreescribe: quien cierra pasa a ser responsable)
 * - Si sesion.id === usuario_id -> usuario_id queda igual.
 * - responsable (VARCHAR) NUNCA se modifica en el cierre.
 */
/**
 * Lista incidencias con filtros y paginación.
 * @param {object} filtros fecha_desde, fecha_hasta, centro, tipo_centro, sistema,
 *                         incidencia, usuario_id, responsable_texto, estado, q
 * @param {number|string} page
 * @param {number|string} limit
 * @returns {Promise<{ data: object[], pagination: object }>}
 */
export async function listarIncidencias(filtros = {}, page = 1, limit = 10) {
  let query = `
    SELECT 
      i.id, i.tipo_centro, i.centro, i.sistema, i.incidencia, i.ticket,
      i.usuario_id, i.responsable, i.descripcion, i.fecha, i.hora_inicio,
      i.hora_fin, i.tiempo_solucion, i.creado_en, i.actualizado_en,
      CONCAT(u.nombre, ' ', u.apellido) AS responsable_actual_nombre
    FROM incidencias i
    INNER JOIN usuarios u ON u.id = i.usuario_id
    WHERE 1=1
  `;
  const params = [];

  if (filtros.fecha_desde) {
    query += ' AND i.fecha >= ?';
    params.push(filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    query += ' AND i.fecha <= ?';
    params.push(filtros.fecha_hasta);
  }
  if (filtros.centro) {
    query += ' AND i.centro LIKE ?';
    params.push(`%${filtros.centro}%`);
  }
  if (filtros.tipo_centro) {
    query += ' AND i.tipo_centro = ?';
    params.push(filtros.tipo_centro);
  }
  if (filtros.sistema) {
    query += ' AND i.sistema LIKE ?';
    params.push(`%${filtros.sistema}%`);
  }
  if (filtros.incidencia) {
    query += ' AND i.incidencia LIKE ?';
    params.push(`%${filtros.incidencia}%`);
  }
  if (filtros.usuario_id) {
    query += ' AND i.usuario_id = ?';
    params.push(filtros.usuario_id);
  }
  if (filtros.responsable_texto) {
    query += ' AND i.responsable LIKE ?';
    params.push(`%${filtros.responsable_texto}%`);
  }
  if (filtros.estado) {
    if (filtros.estado === 'abierta') {
      query += ' AND i.hora_fin IS NULL';
    } else if (filtros.estado === 'cerrada') {
      query += ' AND i.hora_fin IS NOT NULL';
    }
  }
  if (filtros.q) {
    query += ' AND (i.ticket LIKE ? OR i.descripcion LIKE ?)';
    params.push(`%${filtros.q}%`, `%${filtros.q}%`);
  }

  query += ' ORDER BY i.creado_en DESC';

  const offset = (page - 1) * limit;
  query += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  // Contar total
  let countQuery = `
    SELECT COUNT(*) as total
    FROM incidencias i
    WHERE 1=1
  `;
  const countParams = [];

  if (filtros.fecha_desde) {
    countQuery += ' AND i.fecha >= ?';
    countParams.push(filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    countQuery += ' AND i.fecha <= ?';
    countParams.push(filtros.fecha_hasta);
  }
  if (filtros.centro) {
    countQuery += ' AND i.centro LIKE ?';
    countParams.push(`%${filtros.centro}%`);
  }
  if (filtros.tipo_centro) {
    countQuery += ' AND i.tipo_centro = ?';
    countParams.push(filtros.tipo_centro);
  }
  if (filtros.sistema) {
    countQuery += ' AND i.sistema LIKE ?';
    countParams.push(`%${filtros.sistema}%`);
  }
  if (filtros.incidencia) {
    countQuery += ' AND i.incidencia LIKE ?';
    countParams.push(`%${filtros.incidencia}%`);
  }
  if (filtros.usuario_id) {
    countQuery += ' AND i.usuario_id = ?';
    countParams.push(filtros.usuario_id);
  }
  if (filtros.responsable_texto) {
    countQuery += ' AND i.responsable LIKE ?';
    countParams.push(`%${filtros.responsable_texto}%`);
  }
  if (filtros.estado) {
    if (filtros.estado === 'abierta') {
      countQuery += ' AND i.hora_fin IS NULL';
    } else if (filtros.estado === 'cerrada') {
      countQuery += ' AND i.hora_fin IS NOT NULL';
    }
  }
  if (filtros.q) {
    countQuery += ' AND (i.ticket LIKE ? OR i.descripcion LIKE ?)';
    countParams.push(`%${filtros.q}%`, `%${filtros.q}%`);
  }

  // Rendimiento: listado y conteo son independientes -> en paralelo (un solo viaje).
  const [[rows], [totalRows]] = await Promise.all([
    pool.query(query, params),
    pool.query(countQuery, countParams),
  ]);
  const total = totalRows[0].total;

  return {
    data: rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * @param {number|string} id
 * @returns {Promise<object|null>} la incidencia (con nombre del responsable) o null.
 */
export async function obtenerIncidenciaPorId(id) {
  const [rows] = await pool.query(
    `SELECT 
      i.*, CONCAT(u.nombre, ' ', u.apellido) AS responsable_actual_nombre
     FROM incidencias i
     INNER JOIN usuarios u ON u.id = i.usuario_id
     WHERE i.id = ?`,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }
  return rows[0];
}

/**
 * Crea una incidencia. usuario_id siempre sale de la sesión, nunca del body.
 * @throws {Error} 409 si el ticket ya existe.
 */
export async function crearIncidencia(data, usuarioIdSesion) {
  // Validar ticket único
  const [ticketRows] = await pool.query(
    'SELECT id FROM incidencias WHERE ticket = ?',
    [data.ticket]
  );

  if (ticketRows.length > 0) {
    const error = new Error('El ticket ya existe');
    error.statusCode = 409;
    throw error;
  }

  // Insertar: usuario_id = sesion.id, responsable = texto libre
  // fecha, hora_inicio, creado_en, actualizado_en -> MySQL por DEFAULT
  const [result] = await pool.query(
    `INSERT INTO incidencias
      (tipo_centro, centro, sistema, incidencia, ticket, usuario_id, responsable, descripcion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.tipo_centro,
      data.centro,
      data.sistema,
      data.incidencia,
      data.ticket,
      usuarioIdSesion, // usuario_id desde sesión (nunca del body)
      data.responsable, // texto libre
      data.descripcion,
    ]
  );

  return await obtenerIncidenciaPorId(result.insertId);
}

/**
 * Cierra una incidencia: hora_fin = ahora, tiempo_solucion = hora_fin - hora_inicio
 * y, si cierra otro usuario, usuario_id pasa a ser quien cierra.
 * @throws {Error} 404 inexistente, 409 ya cerrada.
 */
export async function cerrarIncidencia(id, usuarioIdSesion) {
  // Obtener incidencia
  const [rows] = await pool.query(
    'SELECT usuario_id, hora_inicio, hora_fin FROM incidencias WHERE id = ?',
    [id]
  );

  if (rows.length === 0) {
    const error = new Error('Incidencia no encontrada');
    error.statusCode = 404;
    throw error;
  }

  const incidencia = rows[0];

  if (incidencia.hora_fin !== null) {
    const error = new Error('La incidencia ya está cerrada');
    error.statusCode = 409;
    throw error;
  }

  // Calcular hora_fin (hora actual del servidor) y tiempo_solucion en una sola consulta
  const { hora_fin: horaFin, tiempo_solucion: tiempoSolucion } =
    await resolverHoraFinYTiempoSolucion(null, incidencia.hora_inicio);

  // Determinar nuevo usuario_id: si cierra otro usuario distinto, sobreescribir
  let nuevoUsuarioId = incidencia.usuario_id;
  if (usuarioIdSesion !== incidencia.usuario_id) {
    nuevoUsuarioId = usuarioIdSesion;
  }

  // Actualizar: hora_fin, tiempo_solucion, usuario_id
  // responsable NO se modifica
  await pool.query(
    `UPDATE incidencias
     SET hora_fin = ?, tiempo_solucion = ?, usuario_id = ?
     WHERE id = ?`,
    [horaFin, tiempoSolucion, nuevoUsuarioId, id]
  );

  return await obtenerIncidenciaPorId(id);
}

/**
 * Calcula tiempo_solucion = horaFin - horaInicio en formato HH:MM:SS.
 * Si el resultado es negativo (cruce de medianoche), suma 24 horas.
 * Rendimiento: una sola consulta (antes podían ser dos).
 */
async function calcularTiempoSolucion(horaFin, horaInicio) {
  const [rows] = await pool.query(
    `SELECT SEC_TO_TIME(MOD(TIME_TO_SEC(TIMEDIFF(?, ?)) + 86400, 86400)) AS tiempo_solucion`,
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

/**
 * Modifica los campos editables de una incidencia y, opcionalmente, la cierra.
 * - fecha y hora_inicio son editables.
 * - Si `cerrar` es true: fija hora_fin (o la hora actual del servidor si no llega)
 *   y calcula tiempo_solucion con la hora de inicio efectiva de esta petición.
 * - Si la incidencia ya está cerrada y llega `hora_fin`, se corrige y se recalcula tiempo_solucion.
 * - usuario_id solo cambia al cerrar si lo hace otro usuario.
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

  const camposEditables = ['tipo_centro', 'centro', 'sistema', 'incidencia', 'responsable', 'descripcion', 'fecha', 'hora_inicio'];
  for (const campo of camposEditables) {
    if (data[campo] !== undefined) {
      updates.push(`${campo} = ?`);
      params.push(data[campo]);
    }
  }

  if (data.ticket !== undefined && data.ticket !== incidencia.ticket) {
    const [dup] = await pool.query('SELECT id FROM incidencias WHERE ticket = ? AND id != ?', [data.ticket, id]);
    if (dup.length > 0) {
      const error = new Error('El ticket ya existe');
      error.statusCode = 409;
      throw error;
    }
    updates.push('ticket = ?');
    params.push(data.ticket);
  }

  // Hora de inicio efectiva: si esta misma petición la modifica, el cálculo de
  // tiempo_solucion debe usar la nueva, no la guardada.
  const horaInicioEfectiva = data.hora_inicio || incidencia.hora_inicio;

  if (data.cerrar) {
    if (incidencia.hora_fin !== null) {
      const error = new Error('La incidencia ya está cerrada');
      error.statusCode = 409;
      throw error;
    }

    // Si no se envia hora_fin, se usa la hora actual del servidor (mismo criterio
    // que cerrarIncidencia). Hora y tiempo_solucion se resuelven en una sola consulta.
    const { hora_fin: horaFin, tiempo_solucion: tiempoSolucion } =
      await resolverHoraFinYTiempoSolucion(data.hora_fin || null, horaInicioEfectiva);

    updates.push('hora_fin = ?', 'tiempo_solucion = ?');
    params.push(horaFin, tiempoSolucion);

    if (usuarioIdSesion !== incidencia.usuario_id) {
      updates.push('usuario_id = ?');
      params.push(usuarioIdSesion);
    }
  } else if (data.hora_fin) {
    // Incidencia ya cerrada: se permite corregir la hora de fin y se
    // recalcula tiempo_solucion con la hora de inicio efectiva.
    const tiempoSolucion = await calcularTiempoSolucion(data.hora_fin, horaInicioEfectiva);

    updates.push('hora_fin = ?', 'tiempo_solucion = ?');
    params.push(data.hora_fin, tiempoSolucion);
  }

  if (updates.length === 0) {
    return incidencia;
  }

  params.push(id);
  await pool.query(`UPDATE incidencias SET ${updates.join(', ')} WHERE id = ?`, params);

  return await obtenerIncidenciaPorId(id);
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
 * Devuelve los valores distintos ya registrados en los campos de autocompletado,
 * para que al crear una incidencia el usuario pueda elegir valores anteriores
 * sin tener que escribirlos de nuevo.
 */
export async function obtenerValoresSugeridos() {
  const [rows] = await pool.query(
    `SELECT DISTINCT centro, sistema, incidencia, responsable
     FROM incidencias
     WHERE centro IS NOT NULL AND TRIM(centro) <> ''
        OR sistema IS NOT NULL AND TRIM(sistema) <> ''
        OR incidencia IS NOT NULL AND TRIM(incidencia) <> ''
        OR responsable IS NOT NULL AND TRIM(responsable) <> ''
     ORDER BY centro, sistema, incidencia, responsable`
  );

  const sugeridos = { centro: [], sistema: [], incidencia: [], responsable: [] };
  for (const fila of rows) {
    for (const campo of Object.keys(sugeridos)) {
      const valor = (fila[campo] || '').trim();
      if (!valor) continue;
      if (!sugeridos[campo].includes(valor)) {
        sugeridos[campo].push(valor);
      }
    }
  }

  return sugeridos;
}

export default {
  listarIncidencias,
  obtenerIncidenciaPorId,
  obtenerValoresSugeridos,
  crearIncidencia,
  actualizarIncidencia,
  cerrarIncidencia,
  eliminarIncidencia,
};
