/**
 * =====================================================================
 * services/permisosService.js — Corazón del sistema de permisos
 * =====================================================================
 * CRUD del catálogo de permisos, resolución de permisos efectivos y
 * asignación de permisos por usuario-rol.
 *
 * LÓGICA A (roles.tipo = 'SISTEMA'):
 *   Los permisos salen de la plantilla roles_permisos y aplican a todos los
 *   usuarios que tengan ese rol.
 *
 * LÓGICA B (roles.tipo = 'PERSONALIZADO'):
 *   Los permisos salen de usuarios_roles_permisos. La columna `concedido` ya
 *   no existe en el schema: UNA FILA = permiso concedido. Para quitar un
 *   permiso se borra la fila.
 *
 * Rendimiento: ambas lógicas se resuelven en UNA consulta con UNION en lugar
 * de encadenar consultas por cada rol del usuario.
 *
 * ALINEADO CON schema.sql:
 *   - `permisos` tiene `creado_por`/`actualizado_por` NOT NULL sin FK, y el
 *     bootstrap los deja en 0, así que el LEFT JOIN + COALESCE resuelve el autor
 *     sin perder filas.
 *   - No existe columna `descripcion`: el catálogo es solo (id, nombre) más
 *     auditoría. La glosa vive en el comentario de la tabla.
 *   - idx_roles_permisos_permiso_id (permiso_id, rol_id)
 *       -> reverse lookup: qué roles usan un permiso. Es lo que permite avisar
 *          antes de borrar uno que sigue en uso.
 *   - idx_urp_permiso (permiso_id)
 *       -> cuántos usuarios lo tienen asignado (Lógica B), en una lectura
 *          directa del índice en vez de un COUNT con JOIN.
 *
 * Para extender: aquí va la regla de resolución de permisos.
 * =====================================================================
 */
import pool from '../config/db.js';

const SELECT_PERMISO = `
  p.id, p.nombre, p.creado_por, p.actualizado_por, p.creado_en, p.actualizado_en,
  COALESCE(c.usuario, CAST(p.creado_por AS CHAR))       AS creado_por_usuario,
  CONCAT_WS(' ', c.nombre, c.apellido)                  AS creado_por_nombre,
  COALESCE(a.usuario, CAST(p.actualizado_por AS CHAR)) AS actualizado_por_usuario,
  CONCAT_WS(' ', a.nombre, a.apellido)                  AS actualizado_por_nombre
`;

const JOINS_PERMISO = `
  LEFT JOIN usuarios c ON c.id = p.creado_por
  LEFT JOIN usuarios a ON a.id = p.actualizado_por
`;

/**
 * Resuelve los permisos efectivos de un usuario (Lógica A ∪ Lógica B).
 *
 * Lógica A entra por usuarios_roles.PK (usuario_id, rol_id) y sale por
 * roles_permisos.PK (rol_id, permiso_id).
 * Lógica B entra por idx_urp_rol_usuario (rol_id, usuario_id); la presencia
 * de la fila ES el permiso (ya no existe la columna concedido).
 *
 * @param {number|string} usuarioId
 * @returns {Promise<string[]>} nombres de permisos únicos.
 */
export async function obtenerPermisosEfectivos(usuarioId) {
  const [rows] = await pool.query(
    `SELECT p.nombre
       FROM usuarios_roles ur
       INNER JOIN roles r ON r.id = ur.rol_id
       INNER JOIN roles_permisos rp ON rp.rol_id = ur.rol_id
       INNER JOIN permisos p ON p.id = rp.permiso_id
      WHERE ur.usuario_id = ? AND r.tipo = 'SISTEMA'
     UNION
     SELECT p.nombre
       FROM usuarios_roles ur
       INNER JOIN roles r ON r.id = ur.rol_id
       INNER JOIN usuarios_roles_permisos urp
         ON urp.usuario_id = ur.usuario_id AND urp.rol_id = ur.rol_id
       INNER JOIN permisos p ON p.id = urp.permiso_id
      WHERE ur.usuario_id = ? AND r.tipo = 'PERSONALIZADO'`,
    [usuarioId, usuarioId]
  );

  return rows.map((row) => row.nombre);
}

/**
 * Lista el catálogo de permisos con auditoría y conteos de uso, para poder
 * mostrar "quién usa este permiso" antes de borrarlo.
 * @returns {Promise<object[]>}
 */
export async function listarPermisos() {
  const [rows] = await pool.query(
    `SELECT ${SELECT_PERMISO},
       (SELECT COUNT(*) FROM roles_permisos WHERE permiso_id = p.id) AS total_roles,
       (SELECT COUNT(*) FROM usuarios_roles_permisos
          WHERE permiso_id = p.id) AS usuarios_concedidos
     FROM permisos p
     ${JOINS_PERMISO}
     ORDER BY p.nombre`
  );
  return rows;
}

/**
 * @param {number|string} id
 * @returns {Promise<object|null>} el permiso o null si no existe.
 */
export async function obtenerPermisoPorId(id) {
  const [rows] = await pool.query(`SELECT ${SELECT_PERMISO} FROM permisos p ${JOINS_PERMISO} WHERE p.id = ?`, [
    id,
  ]);
  return rows.length === 0 ? null : rows[0];
}

/**
 * Crea un permiso con la auditoría de la sesión.
 * @param {string} nombre
 * @param {number} usuarioIdSesion
 * @throws {Error} 400 sin nombre, 409 duplicado.
 */
export async function crearPermiso(nombre, usuarioIdSesion) {
  const limpio = String(nombre || '').trim();
  if (!limpio) throw error400('Nombre de permiso requerido');

  const [dup] = await pool.query('SELECT id FROM permisos WHERE nombre = ?', [limpio]);
  if (dup.length > 0) throw error409('El permiso ya existe');

  const [result] = await pool.query(
    'INSERT INTO permisos (nombre, creado_por, actualizado_por) VALUES (?, ?, ?)',
    [limpio, usuarioIdSesion, usuarioIdSesion]
  );
  return obtenerPermisoPorId(result.insertId);
}

/**
 * Renombra un permiso y refresca `actualizado_por`.
 * @throws {Error} 400 sin nombre, 404 inexistente, 409 duplicado.
 */
export async function actualizarPermiso(id, nombre, usuarioIdSesion) {
  const limpio = String(nombre || '').trim();
  if (!limpio) throw error400('Nombre de permiso requerido');

  const actual = await obtenerPermisoPorId(id);
  if (!actual) throw error404('Permiso no encontrado');

  if (limpio !== actual.nombre) {
    const [dup] = await pool.query('SELECT id FROM permisos WHERE nombre = ? AND id != ?', [limpio, id]);
    if (dup.length > 0) throw error409('El permiso ya existe');
  }

  await pool.query('UPDATE permisos SET nombre = ?, actualizado_por = ? WHERE id = ?', [
    limpio,
    usuarioIdSesion,
    id,
  ]);
  return obtenerPermisoPorId(id);
}

/**
 * Elimina un permiso. Las asignaciones caen por ON DELETE CASCADE en
 * roles_permisos y usuarios_roles_permisos.
 * @throws {Error} 404 si no existe.
 */
export async function eliminarPermiso(id) {
  const permiso = await obtenerPermisoPorId(id);
  if (!permiso) throw error404('Permiso no encontrado');
  await pool.query('DELETE FROM permisos WHERE id = ?', [id]);
  return true;
}

/**
 * Roles que tienen un permiso concreto.
 * Entra por idx_roles_permisos_permiso_id (permiso_id, rol_id): el índice
 * resuelve el permiso y el JOIN con roles es por PK.
 * @throws {Error} 404 si el permiso no existe.
 */
export async function listarRolesDePermiso(permisoId) {
  const permiso = await obtenerPermisoPorId(permisoId);
  if (!permiso) throw error404('Permiso no encontrado');

  const [rows] = await pool.query(
    `SELECT r.id, r.nombre, r.tipo, rp.creado_en AS asignado_en
     FROM roles_permisos rp
     INNER JOIN roles r ON r.id = rp.rol_id
     WHERE rp.permiso_id = ?
     ORDER BY r.tipo, r.nombre`,
    [permisoId]
  );
  return rows;
}

/**
 * Usuarios con un permiso personalizado asignado (Lógica B).
 * Entra por idx_urp_permiso (permiso_id) y une con el rol por PK.
 * El parámetro `estado` se conserva por compatibilidad de la ruta, pero ya no
 * filtra: la existencia de la fila es el único estado posible.
 * @param {'concedido'|'denegado'|'todos'} [estado] ignorado (sin columna concedido)
 */
export async function listarUsuariosDePermiso(permisoId, estado = 'concedido') {
  const permiso = await obtenerPermisoPorId(permisoId);
  if (!permiso) throw error404('Permiso no encontrado');

  const [rows] = await pool.query(
    `SELECT u.id, u.usuario, u.nombre, u.apellido, u.habilitado,
            r.id AS rol_id, r.nombre AS rol, r.tipo AS rol_tipo,
            urp.creado_en AS asignado_en
     FROM usuarios_roles_permisos urp
     INNER JOIN usuarios u ON u.id = urp.usuario_id
     INNER JOIN roles r ON r.id = urp.rol_id
     WHERE urp.permiso_id = ?
     ORDER BY u.apellido, u.nombre`,
    [permisoId]
  );
  return rows;
}

/**
 * Reemplaza los permisos personalizados de un par (usuario, rol).
 * Solo aplica a roles PERSONALIZADO (Lógica B).
 *
 * La reescritura completa (DELETE + INSERT multi-fila en transacción) vive en
 * usuariosService para no duplicar la regla: aquí se delega.
 *
 * @param {number|string} usuarioId
 * @param {number|string} rolId
 * @param {{ permiso_id: number }[]} permisos
 * @throws {Error} 400/404 según validaciones.
 */
export async function asignarPermisosAUsuarioRol(usuarioId, rolId, permisos) {
  const usuariosService = await import('./usuariosService.js');
  return usuariosService.asignarPermisosPersonalizados(usuarioId, rolId, permisos);
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
  obtenerPermisosEfectivos,
  listarPermisos,
  obtenerPermisoPorId,
  crearPermiso,
  actualizarPermiso,
  eliminarPermiso,
  asignarPermisosAUsuarioRol,
  listarRolesDePermiso,
  listarUsuariosDePermiso,
};