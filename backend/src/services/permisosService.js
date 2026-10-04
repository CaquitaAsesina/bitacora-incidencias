import pool from '../config/db.js';

/**
 * Servicio de permisos - Corazón del sistema
 * 
 * LÓGICA A (roles.tipo = 'SISTEMA'): 
 *   - Permisos obtenidos desde roles_permisos (plantilla aplica a todos los usuarios del rol)
 * 
 * LÓGICA B (roles.tipo = 'PERSONALIZADO'):
 *   - Permisos obtenidos desde usuarios_roles_permisos (solo concedido = TRUE)
 * 
 * @param {number} usuarioId 
 * @returns {Promise<string[]>} Array de nombres de permisos únicos
 */
export async function obtenerPermisosEfectivos(usuarioId) {
  const permisosSet = new Set();

  // Obtener todos los roles asignados al usuario
  const [rolesUsuario] = await pool.query(
    `SELECT ur.rol_id, r.tipo, r.nombre
     FROM usuarios_roles ur
     INNER JOIN roles r ON r.id = ur.rol_id
     WHERE ur.usuario_id = ?`,
    [usuarioId]
  );

  for (const rol of rolesUsuario) {
    if (rol.tipo === 'SISTEMA') {
      // LÓGICA A: obtener permisos desde plantilla roles_permisos
      const [permisosSistema] = await pool.query(
        `SELECT p.nombre
         FROM roles_permisos rp
         INNER JOIN permisos p ON p.id = rp.permiso_id
         WHERE rp.rol_id = ?`,
        [rol.rol_id]
      );

      permisosSistema.forEach((p) => permisosSet.add(p.nombre));
    } else if (rol.tipo === 'PERSONALIZADO') {
      // LÓGICA B: obtener permisos personalizados para (usuario, rol) con concedido = TRUE
      const [permisosPersonalizados] = await pool.query(
        `SELECT p.nombre
         FROM usuarios_roles_permisos urp
         INNER JOIN permisos p ON p.id = urp.permiso_id
         WHERE urp.usuario_id = ? AND urp.rol_id = ? AND urp.concedido = TRUE`,
        [usuarioId, rol.rol_id]
      );

      permisosPersonalizados.forEach((p) => permisosSet.add(p.nombre));
    }
  }

  return Array.from(permisosSet);
}

export async function listarPermisos() {
  const [rows] = await pool.query('SELECT * FROM permisos ORDER BY id');
  return rows;
}

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

export default {
  obtenerPermisosEfectivos,
  listarPermisos,
  crearPermiso,
  asignarPermisosAUsuarioRol,
};
