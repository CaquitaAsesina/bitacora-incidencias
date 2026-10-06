/**
 * =====================================================================
 * services/usuariosService.js — Lógica de usuarios
 * =====================================================================
 * CRUD de usuarios + asignación de roles y de permisos por usuario.
 * Contraseñas hasheadas con bcrypt (cost 10).
 *
 * ALINEADO CON schema.sql:
 *   - `usuarios` tiene las columnas de auditoría `creado_por` (NULL en el
 *     primer usuario) y `actualizado_por` (NOT NULL). NO tienen foreign key en
 *     el schema, así que borrar un usuario no rompe los roles/permisos que él
 *     creó: en ese caso la respuesta expone el id crudo y el nombre lo resuelve
 *     el LEFT JOIN como "(desconocido)".
 *   - `incidencias` SÍ tiene FK RESTRICT contra `usuarios`. Por eso un usuario
 *     con incidencias registradas no se puede borrar y aquí se traduce el
 *     error 1451 de MySQL a un 409 con un mensaje accionable.
 *
 * Las reglas de la Lógica B (permisos personalizados) viven aquí: un usuario
 * puede tener permisos propios solo a través de UN rol PERSONALIZADO.
 *
 * Para extender: concentra aquí cualquier regla sobre usuarios/roles/permisos.
 * =====================================================================
 */
import bcrypt from 'bcrypt';
import pool, { withTransaction } from '../config/db.js';

/**
 * Columnas de usuarios tal y como están en el schema, menos `contrasena`
 * (jamás sale del servidor). Se listan explícitamente, no con SELECT *, para
 * que añadir una columna al schema no Filtrar el hash por accidente.
 */
const COLUMNAS_USUARIO = `
  u.id, u.usuario, u.nombre, u.apellido, u.email, u.telefono, u.habilitado,
  u.creado_por, u.actualizado_por, u.creado_en, u.actualizado_en
`;

/** Nombres legibles de los dos autores de auditoría del usuario. */
const AUDITORIA_USUARIO = `
  COALESCE(c.usuario, CAST(u.creado_por AS CHAR))       AS creado_por_usuario,
  CONCAT_WS(' ', c.nombre, c.apellido)                  AS creado_por_nombre,
  COALESCE(a.usuario, CAST(u.actualizado_por AS CHAR)) AS actualizado_por_usuario,
  CONCAT_WS(' ', a.nombre, a.apellido)                  AS actualizado_por_nombre
`;

/**
 * Conteo de incidencias por usuario, usando los índices del schema:
 *   - incidencias_creadas      -> idx_incidencias_creado_por
 *   - incidencias_actualizadas -> idx_incidencias_actualizado_por
 * Se calcula en una sola pasada con dos LEFT JOIN agrupados en lugar de dos
 * subconsultas correlacionadas (que se reejecutarían por fila).
 */
const CONTEO_INCIDENCIAS = `
  LEFT JOIN (
    SELECT creado_por AS usuario_id, COUNT(*) AS total
    FROM incidencias GROUP BY creado_por
  ) AS ic ON ic.usuario_id = u.id
  LEFT JOIN (
    SELECT actualizado_por AS usuario_id, COUNT(*) AS total
    FROM incidencias GROUP BY actualizado_por
  ) AS ia ON ia.usuario_id = u.id
`;

const SELECT_USUARIO = `
  ${COLUMNAS_USUARIO},
  ${AUDITORIA_USUARIO},
  COALESCE(ic.total, 0) AS incidencias_creadas,
  COALESCE(ia.total, 0) AS incidencias_actualizadas
`;

const JOINS_USUARIO = `
  ${CONTEO_INCIDENCIAS}
  LEFT JOIN usuarios c ON c.id = u.creado_por
  LEFT JOIN usuarios a ON a.id = u.actualizado_por
`;

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Ordenamientos permitidos (lista blanca: el valor nunca viene del cliente). */
const ORDENES_PERMITIDOS = {
  // Con filtro por habilitado, (habilitado, apellido, nombre) queda fijo el
  // primer elemento del índice y los otros dos ya vienen ordenados.
  alfabetico: 'u.habilitado DESC, u.apellido ASC, u.nombre ASC, u.id ASC',
  // idx_usuarios_creado_en
  reciente: 'u.creado_en DESC, u.id DESC',
  antiguo: 'u.creado_en ASC, u.id ASC',
  modificado: 'u.actualizado_en DESC, u.id DESC',
  usuario: 'u.usuario ASC',
  nombre: 'u.nombre ASC, u.apellido ASC',
  apellido: 'u.apellido ASC, u.nombre ASC',
  email: 'u.email ASC',
  id: 'u.id ASC',
};

export const ORDENES_USUARIOS = Object.keys(ORDENES_PERMITIDOS);

/**
 * Normaliza una fila de usuario para la API.
 *
 * Unifica el contrato del listado y del detalle: ids de auditoría como número
 * o null, conteos como número, el array `roles` siempre presente y los campos
 * derivados del JOIN convertidos a null en vez de quedar en undefined.
 *
 * `contrasena` no aparece nunca: no está en COLUMNAS_USUARIO.
 * @param {object} fila  fila devuelta por SELECT_USUARIO
 * @param {object[]} [roles]
 * @returns {object}
 */
function mapUsuario(fila, roles = []) {
  const nombreAutor = (v) => (v ? String(v).trim() || null : null);
  const idONulo = (v) => (v === null || v === undefined ? null : Number(v));

  return {
    ...fila,
    creado_por: idONulo(fila.creado_por),
    actualizado_por: idONulo(fila.actualizado_por),
    creado_por_usuario: nombreAutor(fila.creado_por_usuario),
    creado_por_nombre: nombreAutor(fila.creado_por_nombre),
    actualizado_por_usuario: nombreAutor(fila.actualizado_por_usuario),
    actualizado_por_nombre: nombreAutor(fila.actualizado_por_nombre),
    incidencias_creadas: Number(fila.incidencias_creadas) || 0,
    incidencias_actualizadas: Number(fila.incidencias_actualizadas) || 0,
    roles,
  };
}

/**
 * Interpreta `habilitado` como booleano de verdad.
 *
 * El campo llega como booleano JSON desde el frontend, pero un cliente que
 * envíe application/x-www-form-urlencoded manda la CADENA 'false', y
 * Boolean('false') es true: sin esta normalización, "deshabilitar" habilitaría
 * al usuario en lugar de bloquearlo.
 * @param {*} valor
 * @param {boolean} porDefecto valor cuando `valor` viene vacío.
 */
function aBooleano(valor, porDefecto) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  if (typeof valor === 'boolean') return valor;
  const texto = String(valor).trim().toLowerCase();
  if (['true', '1', 'si', 'sí'].includes(texto)) return true;
  if (['false', '0', 'no'].includes(texto)) return false;
  return porDefecto;
}

/** Construye el WHERE del listado de usuarios a partir de los filtros. */
function construirFiltros(filtros = {}) {
  let sql = '';
  const params = [];

  // idx_usuarios_habilitado_nombre: prefijo de una sola columna.
  const habilitado = aBooleano(filtros.habilitado, null);
  if (habilitado === true) {
    sql += ' AND u.habilitado = TRUE';
  } else if (habilitado === false) {
    sql += ' AND u.habilitado = FALSE';
  }

  // Rango de fechas sobre creado_en -> idx_usuarios_creado_en.
  const desde = REGEX_FECHA.test(String(filtros.creado_desde || '').trim())
    ? String(filtros.creado_desde).trim()
    : '';
  const hasta = REGEX_FECHA.test(String(filtros.creado_hasta || '').trim())
    ? String(filtros.creado_hasta).trim()
    : '';
  if (desde && hasta) {
    const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    sql += ' AND u.creado_en >= ? AND u.creado_en < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(`${a} 00:00:00.000000`, `${b} 00:00:00.000000`);
  } else if (desde) {
    sql += ' AND u.creado_en >= ?';
    params.push(`${desde} 00:00:00.000000`);
  } else if (hasta) {
    sql += ' AND u.creado_en < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(`${hasta} 00:00:00.000000`);
  }

  // Filtro por rol: reverse lookup sobre idx_usuarios_roles_rol_id (rol_id, usuario_id).
  const rolId = Number(filtros.rol_id);
  if (Number.isInteger(rolId) && rolId > 0) {
    sql += ' AND EXISTS (SELECT 1 FROM usuarios_roles ur WHERE ur.usuario_id = u.id AND ur.rol_id = ?)';
    params.push(rolId);
  }

  // Texto libre: LIKE con comodín inicial, no indexado a propósito.
  const q = filtros.q === undefined || filtros.q === null ? '' : String(filtros.q).trim();
  if (q) {
    const patron = `%${q}%`;
    sql += ' AND (u.usuario LIKE ? OR u.nombre LIKE ? OR u.apellido LIKE ? OR u.email LIKE ? OR u.telefono LIKE ?)';
    params.push(patron, patron, patron, patron, patron);
  }

  return { sql, params };
}

/**
 * Lista usuarios con TODAS sus columnas (menos la contraseña), los nombres de
 * sus autores de auditoría, sus roles y su conteo de incidencias asociadas.
 *
 * @param {object} filtros habilitado, creado_desde, creado_hasta, rol_id, q, orden
 * @returns {Promise<object[]>}
 */
export async function listarUsuarios(filtros = {}) {
  const { sql: where, params } = construirFiltros(filtros);
  const orden = ORDENES_PERMITIDOS[filtros.orden] || ORDENES_PERMITIDOS.alfabetico;

  // Rendimiento: usuarios y sus roles son independientes -> en paralelo.
  // (MySQL no soporta JSON_ARRAYAGG ... FILTER (WHERE ...) como SQL estándar,
  // así que las relaciones se traen aparte y se ensamblan en memoria.)
  const [[rows], [rolesRows]] = await Promise.all([
    pool.query(`SELECT ${SELECT_USUARIO} FROM usuarios u ${JOINS_USUARIO} WHERE 1=1${where} ORDER BY ${orden}`, params),
    pool.query(
      `SELECT ur.usuario_id, r.id, r.nombre, r.tipo, ur.creado_en AS asignado_en
       FROM usuarios_roles ur
       INNER JOIN roles r ON r.id = ur.rol_id
       ORDER BY r.tipo, r.nombre`
    ),
  ]);

  const rolesPorUsuario = new Map();
  for (const rr of rolesRows) {
    if (!rolesPorUsuario.has(rr.usuario_id)) rolesPorUsuario.set(rr.usuario_id, []);
    rolesPorUsuario.get(rr.usuario_id).push({
      id: rr.id,
      nombre: rr.nombre,
      tipo: rr.tipo,
      asignado_en: rr.asignado_en,
    });
  }

  return rows.map((row) => mapUsuario(row, rolesPorUsuario.get(row.id) || []));
}

/**
 * @param {number|string} id
 * @returns {Promise<object|null>} el usuario completo (sin contraseña) o null.
 */
export async function obtenerUsuarioPorId(id) {
  const [[rows], [rolesRows]] = await Promise.all([
    pool.query(`SELECT ${SELECT_USUARIO} FROM usuarios u ${JOINS_USUARIO} WHERE u.id = ?`, [id]),
    pool.query(
      `SELECT ur.usuario_id, r.id, r.nombre, r.tipo, ur.creado_en AS asignado_en
       FROM usuarios_roles ur
       INNER JOIN roles r ON r.id = ur.rol_id
       WHERE ur.usuario_id = ?
       ORDER BY r.tipo, r.nombre`,
      [id]
    ),
  ]);

  if (rows.length === 0) return null;

  // Mesmo contrato que el listado: quien consulte el detalle ve los mismos
  // roles, conteos y auditoría que en la tabla.
  return mapUsuario(
    rows[0],
    rolesRows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      tipo: r.tipo,
      asignado_en: r.asignado_en,
    }))
  );
}

/**
 * Crea un usuario con contraseña hasheada y la auditoría de la sesión.
 * @param {object} data
 * @param {number} usuarioIdSesion
 * @throws {Error} 400 campo vacío, 409 usuario o email duplicado.
 */
export async function crearUsuario(data, usuarioIdSesion) {
  const usuario = String(data.usuario || '').trim();
  const nombre = String(data.nombre || '').trim();
  const apellido = String(data.apellido || '').trim();
  const email = String(data.email || '').trim();
  const telefono = data.telefono ? String(data.telefono).trim() : null;

  if (!usuario) throw error400('El nombre de usuario es obligatorio');
  if (!nombre) throw error400('El nombre es obligatorio');
  if (!apellido) throw error400('El apellido es obligatorio');
  if (!email) throw error400('El email es obligatorio');
  if (!data.contrasena) throw error400('La contraseña es obligatoria');

  // uq_usuarios_usuario / uq_usuarios_email: se comprueba para devolver 409
  // con mensaje claro en lugar del 1062 crudo de MySQL.
  const [dupUsuario] = await pool.query('SELECT id FROM usuarios WHERE usuario = ?', [usuario]);
  if (dupUsuario.length > 0) throw error409('El nombre de usuario ya existe');

  const [dupEmail] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
  if (dupEmail.length > 0) throw error409('El email ya existe');

  const hashedPassword = await bcrypt.hash(data.contrasena, 10);

  const [result] = await pool.query(
    `INSERT INTO usuarios
       (usuario, contrasena, nombre, apellido, email, telefono, habilitado, creado_por, actualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      usuario,
      hashedPassword,
      nombre,
      apellido,
      email,
      telefono,
      aBooleano(data.habilitado, true),
      usuarioIdSesion,
      usuarioIdSesion,
    ]
  );

  return obtenerUsuarioPorId(result.insertId);
}

/**
 * Actualiza los campos enviados (incluida contraseña opcional) y refresca
 * `actualizado_por` con el usuario de la sesión.
 * @throws {Error} 404 inexistente, 409 usuario/email duplicado.
 */
export async function actualizarUsuario(id, data, usuarioIdSesion) {
  const usuario = await obtenerUsuarioPorId(id);
  if (!usuario) throw error404('Usuario no encontrado');

  const updates = [];
  const params = [];

  if (data.usuario !== undefined && String(data.usuario).trim() !== usuario.usuario) {
    const nuevoUsuario = String(data.usuario).trim();
    if (!nuevoUsuario) throw error400('El nombre de usuario es obligatorio');
    const [dup] = await pool.query('SELECT id FROM usuarios WHERE usuario = ? AND id != ?', [
      nuevoUsuario,
      id,
    ]);
    if (dup.length > 0) throw error409('El nombre de usuario ya existe');
    updates.push('usuario = ?');
    params.push(nuevoUsuario);
  }
  if (data.nombre !== undefined) {
    updates.push('nombre = ?');
    params.push(String(data.nombre).trim());
  }
  if (data.apellido !== undefined) {
    updates.push('apellido = ?');
    params.push(String(data.apellido).trim());
  }
  if (data.email !== undefined && String(data.email).trim() !== usuario.email) {
    const nuevoEmail = String(data.email).trim();
    if (!nuevoEmail) throw error400('El email es obligatorio');
    const [dup] = await pool.query('SELECT id FROM usuarios WHERE email = ? AND id != ?', [
      nuevoEmail,
      id,
    ]);
    if (dup.length > 0) throw error409('El email ya existe');
    updates.push('email = ?');
    params.push(nuevoEmail);
  }
  if (data.telefono !== undefined) {
    updates.push('telefono = ?');
    params.push(data.telefono ? String(data.telefono).trim() : null);
  }
  if (data.habilitado !== undefined && data.habilitado !== '') {
    updates.push('habilitado = ?');
    params.push(aBooleano(data.habilitado, usuario.habilitado));
  }
  if (data.contrasena !== undefined && data.contrasena) {
    updates.push('contrasena = ?');
    params.push(await bcrypt.hash(data.contrasena, 10));
  }

  if (updates.length > 0) {
    // Auditoría: la última modificación siempre lleva la firma de la sesión.
    updates.push('actualizado_por = ?');
    params.push(usuarioIdSesion, id);
    await pool.query(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  return obtenerUsuarioPorId(id);
}

/**
 * Elimina un usuario.
 *
 * `incidencias.creado_por` y `incidencias.actualizado_por` son FK con
 * ON DELETE RESTRICT, así que MySQL rechaza (1451) el borrado si el usuario
 * tiene alguna incidencia vinculada. Se comprueba antes y se responde 409 con
 * el número exacto, que es más útil que un error de FK.
 *
 * @throws {Error} 404 si no existe, 409 si tiene incidencias vinculadas.
 */
export async function eliminarUsuario(id) {
  // El FROM usuarios es lo que hace fiable la comprobación: con solo dos
  // subconsultas (sin FROM) MySQL devuelve siempre una fila de ceros y un id
  // inexistente parecería un borrado correcto.
  const [rows] = await pool.query(
    `SELECT
       u.id,
       (SELECT COUNT(*) FROM incidencias WHERE creado_por = u.id) AS creadas,
       (SELECT COUNT(*) FROM incidencias WHERE actualizado_por = u.id) AS actualizadas
     FROM usuarios u
     WHERE u.id = ?`,
    [id]
  );

  if (rows.length === 0) throw error404('Usuario no encontrado');

  const creadas = Number(rows[0].creadas) || 0;
  const actualizadas = Number(rows[0].actualizadas) || 0;
  if (creadas > 0 || actualizadas > 0) {
    const detalle = [];
    if (creadas > 0) detalle.push(`${creadas} creada(s)`);
    if (actualizadas > 0) detalle.push(`${actualizadas} actualizada(s)`);
    throw error409(
      `No se puede eliminar: el usuario está registrado en ${detalle.join(' y ')} de la bitácora. Deshabilítelo en su lugar.`
    );
  }

  const [resultado] = await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);

  // Salvaguarda ante una carrera: si el DELETE no afectar a ninguna fila
  // (borrado concurrente entre el SELECT y el DELETE), no se reporta éxito.
  if (resultado.affectedRows === 0) throw error404('Usuario no encontrado');

  return true;
}

/** @returns {Promise<object[]>} roles asignados a un usuario. */
export async function listarRolesDeUsuario(usuarioId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.nombre, r.tipo, ur.creado_en AS asignado_en
     FROM usuarios_roles ur
     INNER JOIN roles r ON r.id = ur.rol_id
     WHERE ur.usuario_id = ?
     ORDER BY r.tipo, r.nombre`,
    [usuarioId]
  );
  return rows;
}

/**
 * Asigna un rol a un usuario (idempotente con INSERT IGNORE).
 * @throws {Error} 404 si usuario o rol no existen.
 */
export async function asignarRol(usuarioId, rolId) {
  const [user] = await pool.query('SELECT id FROM usuarios WHERE id = ?', [usuarioId]);
  if (user.length === 0) throw error404('Usuario no encontrado');

  const [rol] = await pool.query('SELECT id FROM roles WHERE id = ?', [rolId]);
  if (rol.length === 0) throw error404('Rol no encontrado');

  // La PK compuesta (usuario_id, rol_id) ya evita el duplicado: INSERT IGNORE
  // no lanza error, simplemente no inserta la segunda vez.
  await pool.query('INSERT IGNORE INTO usuarios_roles (usuario_id, rol_id) VALUES (?, ?)', [
    usuarioId,
    rolId,
  ]);
  return true;
}

/**
 * Quita un rol a un usuario (los permisos personalizados caen en cascada).
 * @throws {Error} 404 si no existen o no estaba asignado.
 */
export async function quitarRol(usuarioId, rolId) {
  const [rel] = await pool.query('SELECT 1 FROM usuarios_roles WHERE usuario_id = ? AND rol_id = ?', [
    usuarioId,
    rolId,
  ]);
  if (rel.length === 0) throw error404('El usuario no tiene ese rol asignado');

  // usuarios_roles_permisos y roles_permisos tienen ON DELETE CASCADE sobre
  // usuarios_roles / roles, así que las asignaciones de esa relación caen solas.
  await pool.query('DELETE FROM usuarios_roles WHERE usuario_id = ? AND rol_id = ?', [
    usuarioId,
    rolId,
  ]);
  return true;
}

/**
 * Reemplaza los permisos personalizados (Lógica B) de un par (usuario, rol).
 *
 * Rendimiento: antes se borraba la lista y luego se insertaba permiso a
 * permiso, en N viajes de red. Ahora es un DELETE + un INSERT multi-fila con
 * los placeholders generados, y en una transacción para que un fallo a mitad no
 * deje al usuario sin permisos.
 *
 * @throws {Error} 400 si el par no existe o el rol no es PERSONALIZADO.
 */
export async function asignarPermisosPersonalizados(usuarioId, rolId, permisos) {
  const { rol } = await validarParUsuarioRol(usuarioId, rolId);

  if (rol.tipo !== 'PERSONALIZADO') {
    throw error400('Solo se pueden asignar permisos personalizados a roles de tipo PERSONALIZADO');
  }

  const ids = normalizarPermisos(permisos);

  // El DELETE + INSERT son atómicos: si el INSERT falla a medias, el usuario
  // perdería los permisos que tenía en lugar de conservar los anteriores.
  // La conexión se pide al entrar en withTransaction, ya validado: si la
  // validación falla, ni se arranca transacción ni se ocupa un hueco del pool.
  await withTransaction(async (conexion) => {
    await conexion.query('DELETE FROM usuarios_roles_permisos WHERE usuario_id = ? AND rol_id = ?', [
      usuarioId,
      rolId,
    ]);

    if (ids.length > 0) {
      const placeholders = ids.map(() => '(?, ?, ?, ?)').join(', ');
      const params = ids.flatMap((p) => [usuarioId, rolId, p.permiso_id, p.concedido]);
      await conexion.query(
        `INSERT INTO usuarios_roles_permisos (usuario_id, rol_id, permiso_id, concedido) VALUES ${placeholders}`,
        params
      );
    }
  });

  return true;
}

/**
 * Normaliza la lista de permisos entrante:[{permiso_id, concedido?}]
 * Descarta entradas sin id, deduplica por permiso_id y sanea `concedido`.
 * @returns {{ permiso_id: number, concedido: number }[]}
 */
function normalizarPermisos(permisos) {
  if (!Array.isArray(permisos)) return [];
  const vistos = new Map();
  for (const p of permisos) {
    const id = Number(p && p.permiso_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    vistos.set(id, { permiso_id: id, concedido: p.concedido === false ? 0 : 1 });
  }
  return [...vistos.values()];
}

/**
 * Valida que exista el par (usuario, rol) y devuelve el rol.
 * NO toma conexión del pool a propósito: es solo lectura y su resultado se
 * reutiliza tanto para consultas simples como para las que luego abren
 * transacción.
 * @throws {Error} 400 si el par no existe, 404 si el rol no existe.
 */
async function validarParUsuarioRol(usuarioId, rolId) {
  const [rel] = await pool.query('SELECT 1 FROM usuarios_roles WHERE usuario_id = ? AND rol_id = ?', [
    usuarioId,
    rolId,
  ]);
  if (rel.length === 0) throw error400('La asignación usuario-rol no existe');

  const [rolRows] = await pool.query('SELECT id, nombre, tipo FROM roles WHERE id = ?', [rolId]);
  if (rolRows.length === 0) throw error404('Rol no encontrado');

  return { rol: rolRows[0] };
}

/**
 * Permisos de un par (usuario, rol) con su estado de concesión.
 * Se traen TODOS (concedidos y denegados) para que el frontend pueda mostrar el
 * estado real de cada permiso, no solo el subconjunto concedido.
 *
 * `idx_urp_rol_usuario (rol_id, usuario_id)` resuelve el par por el rol; el
 * filtro por usuario se aplica sobre las pocas filas de ese rol.
 */
export async function listarPermisosDeUsuarioRol(usuarioId, rolId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.nombre, urp.concedido, urp.creado_en AS asignado_en
     FROM usuarios_roles_permisos urp
     INNER JOIN permisos p ON p.id = urp.permiso_id
     WHERE urp.rol_id = ? AND urp.usuario_id = ?
     ORDER BY p.nombre`,
    [rolId, usuarioId]
  );
  return rows.map((r) => ({ ...r, concedido: Boolean(r.concedido) }));
}

/**
 * Quita un permiso (concedido o denegado) de un par (usuario, rol).
 * @throws {Error} 404 si el par no existe o el permiso no estaba asignado.
 */
export async function quitarPermisoDeUsuarioRol(usuarioId, rolId, permisoId) {
  const [rel] = await pool.query('SELECT 1 FROM usuarios_roles WHERE usuario_id = ? AND rol_id = ?', [
    usuarioId,
    rolId,
  ]);
  if (rel.length === 0) throw error404('La asignación usuario-rol no existe');

  const [result] = await pool.query(
    'DELETE FROM usuarios_roles_permisos WHERE usuario_id = ? AND rol_id = ? AND permiso_id = ?',
    [usuarioId, rolId, permisoId]
  );

  if (result.affectedRows === 0) {
    throw error404('El usuario no tiene ese permiso asignado para ese rol');
  }
  return true;
}

/**
 * Resuelve el rol PERSONALIZADO de un usuario y sus permisos asignados.
 * El frontend solo selecciona el usuario: el servidor determina el rol.
 */
export async function obtenerRolPersonalizadoConPermisos(usuarioId) {
  const [user] = await pool.query('SELECT id FROM usuarios WHERE id = ?', [usuarioId]);
  if (user.length === 0) throw error404('Usuario no encontrado');

  const [roles] = await pool.query(
    `SELECT r.id, r.nombre, r.tipo
     FROM usuarios_roles ur
     INNER JOIN roles r ON r.id = ur.rol_id
     WHERE ur.usuario_id = ?
     ORDER BY r.tipo, r.nombre`,
    [usuarioId]
  );

  const personalizados = roles.filter((r) => r.tipo === 'PERSONALIZADO');

  if (personalizados.length === 0) {
    const tieneSistema = roles.some((r) => r.tipo === 'SISTEMA');
    throw error400(
      tieneSistema
        ? 'El usuario solo tiene roles de tipo SISTEMA. Necesita al menos un rol PERSONALIZADO para asignar permisos por usuario.'
        : 'El usuario no tiene ningún rol asignado. Necesita al menos un rol PERSONALIZADO para asignar permisos.'
    );
  }

  if (personalizados.length > 1) {
    throw error400(
      `El usuario tiene ${personalizados.length} roles PERSONALIZADO (${personalizados
        .map((r) => r.nombre)
        .join(', ')}). Debe tener solo uno para asignar permisos por usuario.`
    );
  }

  const rol = personalizados[0];
  const todos = await listarPermisosDeUsuarioRol(usuarioId, rol.id);

  return {
    rol,
    permisos: todos.filter((p) => p.concedido),
    permisos_detallados: todos,
  };
}

/**
 * Resuelve el rol PERSONALIZADO del usuario y reemplaza sus permisos.
 * @returns {Promise<object>} el rol PERSONALIZADO usado.
 */
export async function asignarPermisosPersonalizadosPorUsuario(usuarioId, permisos) {
  const { rol } = await obtenerRolPersonalizadoConPermisos(usuarioId);
  await asignarPermisosPersonalizados(usuarioId, rol.id, permisos);
  return rol;
}

/** Resuelve el rol PERSONALIZADO del usuario y quita uno de sus permisos. */
export async function quitarPermisoPersonalizadoPorUsuario(usuarioId, permisoId) {
  const { rol } = await obtenerRolPersonalizadoConPermisos(usuarioId);
  return quitarPermisoDeUsuarioRol(usuarioId, rol.id, permisoId);
}

// ----------------------------------------------------------------------
// Errores tipados: el errorHandler ya lee error.statusCode.
// ----------------------------------------------------------------------
function error400(mensaje) {
  const error = new Error(mensaje);
  error.statusCode = 400;
  return error;
}
function error404(mensaje) {
  const error = new Error(mensaje);
  error.statusCode = 404;
  return error;
}
function error409(mensaje) {
  const error = new Error(mensaje);
  error.statusCode = 409;
  return error;
}

export default {
  listarUsuarios,
  obtenerUsuarioPorId,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
  listarRolesDeUsuario,
  asignarRol,
  quitarRol,
  asignarPermisosPersonalizados,
  obtenerRolPersonalizadoConPermisos,
  asignarPermisosPersonalizadosPorUsuario,
  quitarPermisoPersonalizadoPorUsuario,
  listarPermisosDeUsuarioRol,
  quitarPermisoDeUsuarioRol,
  ORDENES_USUARIOS,
};
