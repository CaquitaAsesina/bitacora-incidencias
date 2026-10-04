import pool from '../config/db.js';

export async function listarRoles() {
  const [rows] = await pool.query('SELECT * FROM roles ORDER BY id');
  return rows;
}

export async function obtenerRolPorId(id) {
  const [rows] = await pool.query('SELECT * FROM roles WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  return rows[0];
}

export async function crearRol(data) {
  if (!data.nombre) {
    const error = new Error('Nombre de rol requerido');
    error.statusCode = 400;
    throw error;
  }
  if (data.tipo && !['SISTEMA', 'PERSONALIZADO'].includes(data.tipo)) {
    const error = new Error('Tipo debe ser SISTEMA o PERSONALIZADO');
    error.statusCode = 400;
    throw error;
  }

  const [dup] = await pool.query('SELECT id FROM roles WHERE nombre = ?', [data.nombre]);
  if (dup.length > 0) {
    const error = new Error('El nombre de rol ya existe');
    error.statusCode = 409;
    throw error;
  }

  const [result] = await pool.query(
    'INSERT INTO roles (nombre, tipo) VALUES (?, ?)',
    [data.nombre, data.tipo || 'SISTEMA']
  );
  return await obtenerRolPorId(result.insertId);
}

export async function actualizarRol(id, data) {
  const rol = await obtenerRolPorId(id);
  if (!rol) {
    const error = new Error('Rol no encontrado');
    error.statusCode = 404;
    throw error;
  }

  const updates = [];
  const params = [];

  if (data.nombre !== undefined && data.nombre !== rol.nombre) {
    const [dup] = await pool.query('SELECT id FROM roles WHERE nombre = ? AND id != ?', [data.nombre, id]);
    if (dup.length > 0) {
      const error = new Error('El nombre de rol ya existe');
      error.statusCode = 409;
      throw error;
    }
    updates.push('nombre = ?');
    params.push(data.nombre);
  }

  if (data.tipo !== undefined && data.tipo !== rol.tipo) {
    if (!['SISTEMA', 'PERSONALIZADO'].includes(data.tipo)) {
      const error = new Error('Tipo debe ser SISTEMA o PERSONALIZADO');
      error.statusCode = 400;
      throw error;
    }

    // Regla de cambio de tipo: limpiar tablas correspondientes
    if (data.tipo === 'SISTEMA') {
      // Pasa a SISTEMA → borrar sus filas en usuarios_roles_permisos
      await pool.query('DELETE FROM usuarios_roles_permisos WHERE rol_id = ?', [id]);
    } else if (data.tipo === 'PERSONALIZADO') {
      // Pasa a PERSONALIZADO → borrar sus filas en roles_permisos
      await pool.query('DELETE FROM roles_permisos WHERE rol_id = ?', [id]);
    }

    updates.push('tipo = ?');
    params.push(data.tipo);
  }

  if (updates.length > 0) {
    params.push(id);
    await pool.query(`UPDATE roles SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  return await obtenerRolPorId(id);
}

export async function eliminarRol(id) {
  const rol = await obtenerRolPorId(id);
  if (!rol) {
    const error = new Error('Rol no encontrado');
    error.statusCode = 404;
    throw error;
  }

  await pool.query('DELETE FROM roles WHERE id = ?', [id]);
  return true;
}

export async function listarUsuariosDeRol(rolId) {
  const rol = await obtenerRolPorId(rolId);
  if (!rol) {
    const error = new Error('Rol no encontrado');
    error.statusCode = 404;
    throw error;
  }

  const [rows] = await pool.query(
    `SELECT u.id, u.usuario, u.nombre, u.apellido, u.email, u.habilitado
     FROM usuarios_roles ur
     INNER JOIN usuarios u ON u.id = ur.usuario_id
     WHERE ur.rol_id = ?
     ORDER BY u.usuario`,
    [rolId]
  );
  return rows;
}

export async function listarPermisosDeRol(id) {
  const rol = await obtenerRolPorId(id);
  if (!rol) {
    const error = new Error('Rol no encontrado');
    error.statusCode = 404;
    throw error;
  }

  const [rows] = await pool.query(
    `SELECT p.id, p.nombre
     FROM roles_permisos rp
     INNER JOIN permisos p ON p.id = rp.permiso_id
     WHERE rp.rol_id = ?
     ORDER BY p.nombre`,
    [id]
  );
  return rows;
}

export async function asignarPermisosRol(id, permisos) {
  const rol = await obtenerRolPorId(id);
  if (!rol) {
    const error = new Error('Rol no encontrado');
    error.statusCode = 404;
    throw error;
  }

  if (rol.tipo === 'PERSONALIZADO') {
    const error = new Error('No se puede asignar plantilla a un rol PERSONALIZADO');
    error.statusCode = 400;
    throw error;
  }

  // Limpiar permisos existentes
  await pool.query('DELETE FROM roles_permisos WHERE rol_id = ?', [id]);

  if (permisos && Array.isArray(permisos)) {
    for (const permisoId of permisos) {
      await pool.query('INSERT INTO roles_permisos (rol_id, permiso_id) VALUES (?, ?)', [id, permisoId]);
    }
  }

  return true;
}

export async function quitarPermisoDeRol(id, permisoId) {
  const rol = await obtenerRolPorId(id);
  if (!rol) {
    const error = new Error('Rol no encontrado');
    error.statusCode = 404;
    throw error;
  }

  const [result] = await pool.query(
    'DELETE FROM roles_permisos WHERE rol_id = ? AND permiso_id = ?',
    [id, permisoId]
  );

  if (result.affectedRows === 0) {
    const error = new Error('El rol no tiene ese permiso asignado');
    error.statusCode = 404;
    throw error;
  }

  return true;
}

export default {
  listarRoles,
  obtenerRolPorId,
  crearRol,
  actualizarRol,
  eliminarRol,
  listarUsuariosDeRol,
  listarPermisosDeRol,
  asignarPermisosRol,
  quitarPermisoDeRol,
};
