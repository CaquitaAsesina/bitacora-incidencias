import bcrypt from 'bcrypt';
import pool from '../config/db.js';

export async function listarUsuarios() {
  const [rows] = await pool.query(
    `SELECT id, usuario, nombre, apellido, email, telefono, habilitado, creado_en, actualizado_en
     FROM usuarios
     ORDER BY id`
  );
  return rows;
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

export default {
  listarUsuarios,
  obtenerUsuarioPorId,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
  asignarRol,
  asignarPermisosPersonalizados,
};
