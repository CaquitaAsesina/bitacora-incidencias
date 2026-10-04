import bcrypt from 'bcrypt';
import pool from '../config/db.js';

export async function listarUsuarios() {
  const [rows] = await pool.query(
    `SELECT id, usuario, nombre, apellido, email, telefono, habilitado, creado_en, actualizado_en
     FROM usuarios
     ORDER BY id`
  );

  // Roles asignados por usuario. Se consulta aparte porque un usuario puede tener
  // N roles y MySQL no soporta JSON_ARRAYAGG ... FILTER (WHERE ...) como SQL estándar.
  const [rolesRows] = await pool.query(
    `SELECT ur.usuario_id, r.id, r.nombre, r.tipo
     FROM usuarios_roles ur
     INNER JOIN roles r ON r.id = ur.rol_id
     ORDER BY r.nombre`
  );

  const rolesPorUsuario = new Map();
  for (const rr of rolesRows) {
    if (!rolesPorUsuario.has(rr.usuario_id)) rolesPorUsuario.set(rr.usuario_id, []);
    rolesPorUsuario.get(rr.usuario_id).push({ id: rr.id, nombre: rr.nombre, tipo: rr.tipo });
  }

  // Se agrega el array `roles` a cada usuario para que el frontend muestre la
  // columna "Rol" sin una petición extra por usuario (evita N+1).
  return rows.map((row) => ({
    ...row,
    roles: rolesPorUsuario.get(row.id) || [],
  }));
}

export async function obtenerUsuarioPorId(id) {
  const [rows] = await pool.query(
    `SELECT id, usuario, nombre, apellido, email, telefono, habilitado
     FROM usuarios
     WHERE id = ?`,
    [id]
  );
  if (rows.length === 0) return null;
  return rows[0];
}

export async function crearUsuario(data) {
  // Validar unicidad
  const [dupUsuario] = await pool.query('SELECT id FROM usuarios WHERE usuario = ?', [data.usuario]);
  if (dupUsuario.length > 0) {
    const error = new Error('El nombre de usuario ya existe');
    error.statusCode = 409;
    throw error;
  }

  const [dupEmail] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [data.email]);
  if (dupEmail.length > 0) {
    const error = new Error('El email ya existe');
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(data.contrasena, 10);

  const [result] = await pool.query(
    `INSERT INTO usuarios (usuario, contrasena, nombre, apellido, email, telefono, habilitado)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.usuario,
      hashedPassword,
      data.nombre,
      data.apellido,
      data.email,
      data.telefono || null,
      data.habilitado !== false,
    ]
  );

  return await obtenerUsuarioPorId(result.insertId);
}

export async function actualizarUsuario(id, data) {
  const usuario = await obtenerUsuarioPorId(id);
  if (!usuario) {
    const error = new Error('Usuario no encontrado');
    error.statusCode = 404;
    throw error;
  }

  const updates = [];
  const params = [];

  if (data.usuario !== undefined && data.usuario !== usuario.usuario) {
    const [dup] = await pool.query('SELECT id FROM usuarios WHERE usuario = ? AND id != ?', [data.usuario, id]);
    if (dup.length > 0) {
      const error = new Error('El nombre de usuario ya existe');
      error.statusCode = 409;
      throw error;
    }
    updates.push('usuario = ?');
    params.push(data.usuario);
  }
  if (data.nombre !== undefined) {
    updates.push('nombre = ?');
    params.push(data.nombre);
  }
  if (data.apellido !== undefined) {
    updates.push('apellido = ?');
    params.push(data.apellido);
  }
  if (data.email !== undefined && data.email !== usuario.email) {
    const [dup] = await pool.query('SELECT id FROM usuarios WHERE email = ? AND id != ?', [data.email, id]);
    if (dup.length > 0) {
      const error = new Error('El email ya existe');
      error.statusCode = 409;
      throw error;
    }
    updates.push('email = ?');
    params.push(data.email);
  }
  if (data.telefono !== undefined) {
    updates.push('telefono = ?');
    params.push(data.telefono || null);
  }
  if (data.habilitado !== undefined) {
    updates.push('habilitado = ?');
    params.push(Boolean(data.habilitado));
  }
  if (data.contrasena !== undefined && data.contrasena) {
    const hashedPassword = await bcrypt.hash(data.contrasena, 10);
    updates.push('contrasena = ?');
    params.push(hashedPassword);
  }

  if (updates.length > 0) {
    params.push(id);
    await pool.query(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  return await obtenerUsuarioPorId(id);
}

export async function eliminarUsuario(id) {
  const usuario = await obtenerUsuarioPorId(id);
  if (!usuario) {
    const error = new Error('Usuario no encontrado');
    error.statusCode = 404;
    throw error;
  }

  await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
  return true;
}

export async function listarRolesDeUsuario(usuarioId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.nombre, r.tipo
     FROM usuarios_roles ur
     INNER JOIN roles r ON r.id = ur.rol_id
     WHERE ur.usuario_id = ?
     ORDER BY r.nombre`,
    [usuarioId]
  );
  return rows;
}

export async function asignarRol(usuarioId, rolId) {
  const [user] = await pool.query('SELECT id FROM usuarios WHERE id = ?', [usuarioId]);
  if (user.length === 0) {
    const error = new Error('Usuario no encontrado');
    error.statusCode = 404;
    throw error;
  }

  const [rol] = await pool.query('SELECT id FROM roles WHERE id = ?', [rolId]);
  if (rol.length === 0) {
    const error = new Error('Rol no encontrado');
    error.statusCode = 404;
    throw error;
  }

  // Insertar con IGNORE para evitar duplicados
  await pool.query('INSERT IGNORE INTO usuarios_roles (usuario_id, rol_id) VALUES (?, ?)', [usuarioId, rolId]);
  return true;
}

export async function quitarRol(usuarioId, rolId) {
  const [user] = await pool.query('SELECT id FROM usuarios WHERE id = ?', [usuarioId]);
  if (user.length === 0) {
    const error = new Error('Usuario no encontrado');
    error.statusCode = 404;
    throw error;
  }

  const [rol] = await pool.query('SELECT id FROM roles WHERE id = ?', [rolId]);
  if (rol.length === 0) {
    const error = new Error('Rol no encontrado');
    error.statusCode = 404;
    throw error;
  }

  const [rel] = await pool.query(
    'SELECT 1 FROM usuarios_roles WHERE usuario_id = ? AND rol_id = ?',
    [usuarioId, rolId]
  );
  if (rel.length === 0) {
    const error = new Error('El usuario no tiene ese rol asignado');
    error.statusCode = 404;
    throw error;
  }

  // La tabla usuarios_roles_permisos tiene ON DELETE CASCADE sobre usuarios_roles,
  // por lo que los permisos personalizados de esa relación se borran en cascada.
  await pool.query('DELETE FROM usuarios_roles WHERE usuario_id = ? AND rol_id = ?', [usuarioId, rolId]);
  return true;
}

export async function asignarPermisosPersonalizados(usuarioId, rolId, permisos) {
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

  if (rol[0].tipo !== 'PERSONALIZADO') {
    const error = new Error('Solo se pueden asignar permisos personalizados a roles de tipo PERSONALIZADO');
    error.statusCode = 400;
    throw error;
  }

  // Limpiar permisos existentes para este (usuario, rol)
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

export async function listarPermisosDeUsuarioRol(usuarioId, rolId) {
  const [rel] = await pool.query('SELECT 1 FROM usuarios_roles WHERE usuario_id = ? AND rol_id = ?', [usuarioId, rolId]);
  if (rel.length === 0) {
    const error = new Error('La asignación usuario-rol no existe');
    error.statusCode = 404;
    throw error;
  }

  const [rows] = await pool.query(
    `SELECT p.id, p.nombre
     FROM usuarios_roles_permisos urp
     INNER JOIN permisos p ON p.id = urp.permiso_id
     WHERE urp.usuario_id = ? AND urp.rol_id = ? AND urp.concedido = TRUE
     ORDER BY p.nombre`,
    [usuarioId, rolId]
  );
  return rows;
}

export async function quitarPermisoDeUsuarioRol(usuarioId, rolId, permisoId) {
  const [rel] = await pool.query('SELECT 1 FROM usuarios_roles WHERE usuario_id = ? AND rol_id = ?', [usuarioId, rolId]);
  if (rel.length === 0) {
    const error = new Error('La asignación usuario-rol no existe');
    error.statusCode = 404;
    throw error;
  }

  const [result] = await pool.query(
    'DELETE FROM usuarios_roles_permisos WHERE usuario_id = ? AND rol_id = ? AND permiso_id = ?',
    [usuarioId, rolId, permisoId]
  );

  if (result.affectedRows === 0) {
    const error = new Error('El usuario no tiene ese permiso asignado para ese rol');
    error.statusCode = 404;
    throw error;
  }

  return true;
}

/**
 * Resuelve el rol PERSONALIZADO de un usuario y sus permisos asignados.
 * El frontend solo selecciona el usuario: el servidor determina el rol.
 */
export async function obtenerRolPersonalizadoConPermisos(usuarioId) {
  const [user] = await pool.query('SELECT id FROM usuarios WHERE id = ?', [usuarioId]);
  if (user.length === 0) {
    const error = new Error('Usuario no encontrado');
    error.statusCode = 404;
    throw error;
  }

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
    const error = new Error(
      tieneSistema
        ? 'El usuario solo tiene roles de tipo SISTEMA. Necesita al menos un rol PERSONALIZADO para asignar permisos por usuario.'
        : 'El usuario no tiene ningún rol asignado. Necesita al menos un rol PERSONALIZADO para asignar permisos.'
    );
    error.statusCode = 400;
    throw error;
  }

  if (personalizados.length > 1) {
    const error = new Error(
      `El usuario tiene ${personalizados.length} roles PERSONALIZADO (${personalizados
        .map((r) => r.nombre)
        .join(', ')}). Debe tener solo uno para asignar permisos por usuario.`
    );
    error.statusCode = 400;
    throw error;
  }

  const rol = personalizados[0];
  const permisos = await listarPermisosDeUsuarioRol(usuarioId, rol.id);

  return { rol, permisos };
}

export async function asignarPermisosPersonalizadosPorUsuario(usuarioId, permisos) {
  const { rol } = await obtenerRolPersonalizadoConPermisos(usuarioId);
  await asignarPermisosPersonalizados(usuarioId, rol.id, permisos);
  return rol;
}

export async function quitarPermisoPersonalizadoPorUsuario(usuarioId, permisoId) {
  const { rol } = await obtenerRolPersonalizadoConPermisos(usuarioId);
  return quitarPermisoDeUsuarioRol(usuarioId, rol.id, permisoId);
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
};
