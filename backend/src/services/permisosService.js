import pool from '../config/db.js';

/**
 * =====================================================================
 * services/permisosService.js — Corazón del sistema de permisos
 * =====================================================================
 * CRUD del catálogo de permisos y asignación de permisos usuario-rol.
 *
 * Servicio de permisos - Corazón del sistema
 * 
 * LÓGICA A (roles.tipo = 'SISTEMA'): 
 *   - Permisos obtenidos desde roles_permisos (plantilla aplica a todos los usuarios del rol)
 * 
 * LÓGICA B (roles.tipo = 'PERSONALIZADO'):
 *   - Permisos obtenidos desde usuarios_roles_permisos (solo concedido = TRUE)
 *
 * Rendimiento: ambas lógicas se resuelven en UNA sola consulta (UNION) en
 * lugar de encadenar consultas por cada rol del usuario.
 *
 * @param {number} usuarioId 
 * @returns {Promise<string[]>} Array de nombres de permisos únicos
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
      WHERE ur.usuario_id = ? AND r.tipo = 'PERSONALIZADO' AND urp.concedido = TRUE`,
    [usuarioId, usuarioId]
  );

  return rows.map((row) => row.nombre);
}

/** @returns {Promise<object[]>} catálogo completo de permisos, ordenado por id. */
export async function listarPermisos() {
  const [rows] = await pool.query('SELECT * FROM permisos ORDER BY id');
  return rows;
}

/**
 * Crea un permiso nuevo.
 * @throws {Error} 400 si falta el nombre, 409 si ya existe.
 */
export async function crearPermiso(nombre) {
  if (!nombre) {
    const error = new Error('Nombre de permiso requerido');
    error.statusCode = 400;
    throw error;
  }

  const [dup] = await pool.query('SELECT id FROM permisos WHERE nombre = ?', [nombre]);
  if (dup.length > 0) {
    const error = new Error('El permiso ya existe');
    error.statusCode = 409;
    throw error;
  }

  const [result] = await pool.query('INSERT INTO permisos (nombre) VALUES (?)', [nombre]);
  const [rows] = await pool.query('SELECT * FROM permisos WHERE id = ?', [result.insertId]);
  return rows[0];
}

/**
 * Reemplaza los permisos personalizados de un par (usuario, rol).
 * Solo aplica a roles PERSONALIZADO (Lógica B).
 * @param {number|string} usuarioId
 * @param {number|string} rolId
 * @param {{ permiso_id: number, concedido?: boolean }[]} permisos
 * @throws {Error} 400/404 según validaciones.
 */
export async function asignarPermisosAUsuarioRol(usuarioId, rolId, permisos) {
  const [rel] = await pool.query('SELECT 1 FROM usuarios_roles WHERE usuario_id = ? AND rol_id = ?', [usuarioId, rolId]);
  if (rel.length === 0) {
    const error = new Error('La asignación usuario-rol no existe');
    error.statusCode = 400;
    throw error;
  }

  const [rol] = await pool.query('SELECT tipo FROM roles WHERE id = ?', [rolId]);
  if (rol.length === 0) {
    const error = new Error('Rol no encontrado');
    error.statusCode = 404;
    throw error;
  }

  if (rol[0].tipo === 'SISTEMA') {
    const error = new Error('No se pueden asignar permisos por usuario a un rol SISTEMA');
    error.statusCode = 400;
    throw error;
  }

  await pool.query('DELETE FROM usuarios_roles_permisos WHERE usuario_id = ? AND rol_id = ?', [usuarioId, rolId]);

  if (permisos && Array.isArray(permisos)) {
    for (const p of permisos) {
      if (!p.permiso_id) continue;
      await pool.query(
        `INSERT INTO usuarios_roles_permisos (usuario_id, rol_id, permiso_id, concedido)
         VALUES (?, ?, ?, ?)`,
        [usuarioId, rolId, p.permiso_id, p.concedido !== false]
      );
    }
  }

  return true;
}

/**
 * Renombra un permiso existente.
 * @throws {Error} 400 sin nombre, 404 inexistente, 409 duplicado.
 */
export async function actualizarPermiso(id, nombre) {
  if (!nombre) {
    const error = new Error('Nombre de permiso requerido');
    error.statusCode = 400;
    throw error;
  }

  const [rows] = await pool.query('SELECT id FROM permisos WHERE id = ?', [id]);
  if (rows.length === 0) {
    const error = new Error('Permiso no encontrado');
    error.statusCode = 404;
    throw error;
  }

  const [dup] = await pool.query('SELECT id FROM permisos WHERE nombre = ? AND id != ?', [nombre, id]);
  if (dup.length > 0) {
    const error = new Error('El permiso ya existe');
    error.statusCode = 409;
    throw error;
  }

  await pool.query('UPDATE permisos SET nombre = ? WHERE id = ?', [nombre, id]);
  const [updated] = await pool.query('SELECT * FROM permisos WHERE id = ?', [id]);
  return updated[0];
}

/**
 * Elimina un permiso (las asignaciones caen por ON DELETE CASCADE).
 * @throws {Error} 404 si no existe.
 */
export async function eliminarPermiso(id) {
  const [rows] = await pool.query('SELECT id FROM permisos WHERE id = ?', [id]);
  if (rows.length === 0) {
    const error = new Error('Permiso no encontrado');
    error.statusCode = 404;
    throw error;
  }

  // roles_permisos y usuarios_roles_permisos tienen ON DELETE CASCADE,
  // por lo que las asignaciones del permiso se eliminan en cascada.
  await pool.query('DELETE FROM permisos WHERE id = ?', [id]);
  return true;
}

export default {
  obtenerPermisosEfectivos,
  listarPermisos,
  crearPermiso,
  actualizarPermiso,
  eliminarPermiso,
  asignarPermisosAUsuarioRol,
};
