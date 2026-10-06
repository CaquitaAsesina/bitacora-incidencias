/**
 * =====================================================================
 * services/rolesService.js — Lógica de roles
 * =====================================================================
 * CRUD de roles y relación rol <-> permisos / rol <-> usuarios.
 *
 * Regla clave: un rol es SISTEMA (plantilla en roles_permisos, Lógica A) o
 * PERSONALIZADO (permisos por usuario, usuarios_roles_permisos, Lógica B).
 * Al cambiar el tipo se limpian las tablas que ya no aplican.
 *
 * ALINEADO CON schema.sql:
 *   - `roles` tiene `creado_por` y `actualizado_por` NOT NULL, SIN foreign key.
 *     El bootstrap los deja en 0 ("sin autor"), así que un JOIN a usuarios no
 *     puede ser INNER: se resuelve con LEFT JOIN y COALESCE para que esos
 *     roles sigan apareciendo con su autor crudo.
 *   - idx_roles_tipo (tipo)            -> filtrar por SISTEMA/PERSONALIZADO.
 *   - idx_usuarios_roles_rol_id (rol_id, usuario_id)
 *                                     -> reverse lookup: usuarios de un rol.
 *   - roles_permisos.PK (rol_id, permiso_id) -> permisos de la plantilla.
 *
 * Para extender: concentra aquí cualquier regla de negocio sobre roles.
 * =====================================================================
 */
import pool, { withTransaction } from '../config/db.js';

/**
 * El bootstrap inserta los roles con creado_por/actualizado_por = 0 y no hay
 * fila con id 0 en usuarios, así que COALESCE cae al id crudo.
 */
const SELECT_ROL = `
  r.id, r.nombre, r.tipo, r.creado_por, r.actualizado_por, r.creado_en, r.actualizado_en,
  COALESCE(c.usuario, CAST(r.creado_por AS CHAR))       AS creado_por_usuario,
  CONCAT_WS(' ', c.nombre, c.apellido)                  AS creado_por_nombre,
  COALESCE(a.usuario, CAST(r.actualizado_por AS CHAR)) AS actualizado_por_usuario,
  CONCAT_WS(' ', a.nombre, a.apellido)                  AS actualizado_por_nombre
`;

const JOINS_ROL = `
  LEFT JOIN usuarios c ON c.id = r.creado_por
  LEFT JOIN usuarios a ON a.id = r.actualizado_por
`;

/**
 * Conteos relacionados. Son subconsultas correlacionadas por fila (una por
 * rol), pero cada una entra por el índice de su tabla de relación, así que no
 * recorren la tabla entera:
 *   - permisos               -> PK (rol_id, permiso_id) en roles_permisos
 *   - usuarios               -> idx_usuarios_roles_rol_id (rol_id, usuario_id)
 *   - usuarios con permisos  -> idx_urp_rol_usuario (rol_id, usuario_id)
 *
 * Con pocos roles sale más barato esto que tres LEFT JOIN agrupados sobre toda
 * la tabla de relaciones.
 */
const CONTEO_RELACIONES = `
  (SELECT COUNT(*) FROM roles_permisos WHERE rol_id = r.id) AS total_permisos,
  (SELECT COUNT(*) FROM usuarios_roles WHERE rol_id = r.id) AS total_usuarios,
  (SELECT COUNT(DISTINCT urp.usuario_id) FROM usuarios_roles_permisos urp
     WHERE urp.rol_id = r.id) AS usuarios_con_permisos
`;

/** Normaliza el campo `tipo` y valida contra el CHECK del schema. */
function validarTipo(tipo) {
  const valor = String(tipo || '').trim().toUpperCase();
  if (!['SISTEMA', 'PERSONALIZADO'].includes(valor)) {
    throw error400('Tipo debe ser SISTEMA o PERSONALIZADO');
  }
  return valor;
}

/**
 * Lista todos los roles con auditoría y conteos relacionados.
 * @param {{ tipo?: string }} filtros
 * @returns {Promise<object[]>}
 */
export async function listarRoles(filtros = {}) {
  let sql = '';
  const params = [];

  // idx_roles_tipo: el filtro es de igualdad sobre la única columna del índice.
  if (filtros.tipo) {
    sql = ' WHERE r.tipo = ?';
    params.push(validarTipo(filtros.tipo));
  }

  const [rows] = await pool.query(
    `SELECT ${SELECT_ROL}, ${CONTEO_RELACIONES}
     FROM roles r
     ${JOINS_ROL}${sql}
     ORDER BY r.tipo ASC, r.nombre ASC`,
    params
  );
  return rows;
}

/**
 * @param {number|string} id
 * @param {{ incluirConteos?: boolean }} opciones
 * @returns {Promise<object|null>} el rol o null si no existe.
 */
export async function obtenerRolPorId(id, opciones = {}) {
  const columnas = opciones.incluirConteos ? `${SELECT_ROL}, ${CONTEO_RELACIONES}` : SELECT_ROL;
  const [rows] = await pool.query(`SELECT ${columnas} FROM roles r ${JOINS_ROL} WHERE r.id = ?`, [id]);
  if (rows.length === 0) return null;
  return rows[0];
}

/**
 * Crea un rol con la auditoría de la sesión.
 * @param {{ nombre: string, tipo?: 'SISTEMA'|'PERSONALIZADO' }} data
 * @param {number} usuarioIdSesion
 * @throws {Error} 400 nombre/tipo inválido, 409 nombre duplicado.
 */
export async function crearRol(data, usuarioIdSesion) {
  const nombre = String(data.nombre || '').trim();
  if (!nombre) throw error400('Nombre de rol requerido');

  const tipo = data.tipo ? validarTipo(data.tipo) : 'SISTEMA';

  const [dup] = await pool.query('SELECT id FROM roles WHERE nombre = ?', [nombre]);
  if (dup.length > 0) throw error409('El nombre de rol ya existe');

  const [result] = await pool.query(
    'INSERT INTO roles (nombre, tipo, creado_por, actualizado_por) VALUES (?, ?, ?, ?)',
    [nombre, tipo, usuarioIdSesion, usuarioIdSesion]
  );
  return obtenerRolPorId(result.insertId, { incluirConteos: true });
}

/**
 * Actualiza nombre/tipo y refresca `actualizado_por` con el usuario de la
 * sesión. Al cambiar de tipo limpia la tabla de la lógica que deja de aplicar.
 * @throws {Error} 404 inexistente, 400 tipo inválido, 409 nombre duplicado.
 */
export async function actualizarRol(id, data, usuarioIdSesion) {
  const rol = await obtenerRolPorId(id);
  if (!rol) throw error404('Rol no encontrado');

  const updates = [];
  const params = [];
  let tablasALimpiar = [];

  if (data.nombre !== undefined && String(data.nombre).trim() !== rol.nombre) {
    const nombre = String(data.nombre).trim();
    if (!nombre) throw error400('Nombre de rol requerido');
    const [dup] = await pool.query('SELECT id FROM roles WHERE nombre = ? AND id != ?', [nombre, id]);
    if (dup.length > 0) throw error409('El nombre de rol ya existe');
    updates.push('nombre = ?');
    params.push(nombre);
  }

  if (data.tipo !== undefined && validarTipo(data.tipo) !== rol.tipo) {
    const tipo = validarTipo(data.tipo);

    // Regla de cambio de tipo: limpiar las tablas de la lógica que ya no aplica.
    // Van en la MISMA transacción que el UPDATE: si el UPDATE fallara después
    // del DELETE, el rol habría perdido sus permisos sin haber cambiado de tipo.
    tablasALimpiar =
      tipo === 'SISTEMA'
        ? // Pasa a SISTEMA -> sus permisos por usuario (Lógica B) dejan de aplicar.
          ['usuarios_roles_permisos']
        : // Pasa a PERSONALIZADO -> su plantilla (Lógica A) deja de aplicar.
          ['roles_permisos'];

    updates.push('tipo = ?');
    params.push(tipo);
  }

  if (updates.length > 0) {
    updates.push('actualizado_por = ?');
    params.push(usuarioIdSesion, id);

    await withTransaction(async (conexion) => {
      for (const tabla of tablasALimpiar) {
        // `tabla` solo puede ser una de las dos literales de arriba: nunca
        // viene del cliente, así que no hay inyección posible en el nombre.
        await conexion.query(`DELETE FROM ${tabla} WHERE rol_id = ?`, [id]);
      }
      await conexion.query(`UPDATE roles SET ${updates.join(', ')} WHERE id = ?`, params);
    });
  }

  return obtenerRolPorId(id, { incluirConteos: true });
}

/**
 * Elimina un rol. Las relaciones caen por ON DELETE CASCADE en usuarios_roles,
 * roles_permisos y usuarios_roles_permisos.
 * @throws {Error} 404 si no existe.
 */
export async function eliminarRol(id) {
  const rol = await obtenerRolPorId(id);
  if (!rol) throw error404('Rol no encontrado');
  await pool.query('DELETE FROM roles WHERE id = ?', [id]);
  return true;
}

/**
 * Usuarios asignados al rol.
 * Entra por idx_usuarios_roles_rol_id (rol_id, usuario_id): el índice trae
 * primero los usuarios del rol y el JOIN con usuarios es por PK.
 * @throws {Error} 404 si el rol no existe.
 */
export async function listarUsuariosDeRol(rolId) {
  const rol = await obtenerRolPorId(rolId);
  if (!rol) throw error404('Rol no encontrado');

  const [rows] = await pool.query(
    `SELECT u.id, u.usuario, u.nombre, u.apellido, u.email, u.habilitado, ur.creado_en AS asignado_en
     FROM usuarios_roles ur
     INNER JOIN usuarios u ON u.id = ur.usuario_id
     WHERE ur.rol_id = ?
     ORDER BY u.apellido, u.nombre`,
    [rolId]
  );
  return rows;
}

/**
 * Permisos de la plantilla del rol (Lógica A), solo para roles SISTEMA.
 * La PK (rol_id, permiso_id) resuelve el filtro por rol.
 * @throws {Error} 404 si el rol no existe.
 */
export async function listarPermisosDeRol(id) {
  const rol = await obtenerRolPorId(id);
  if (!rol) throw error404('Rol no encontrado');

  const [rows] = await pool.query(
    `SELECT p.id, p.nombre, p.creado_por, p.actualizado_por, p.creado_en, p.actualizado_en,
            rp.creado_en AS asignado_en
     FROM roles_permisos rp
     INNER JOIN permisos p ON p.id = rp.permiso_id
     WHERE rp.rol_id = ?
     ORDER BY p.nombre`,
    [id]
  );
  return rows;
}

/**
 * Reemplaza la plantilla de permisos de un rol SISTEMA.
 *
 * Rendimiento: antes borraba la plantilla y luego insertaba permiso a permiso
 * (N viajes de red sin transacción). Ahora es un DELETE + un INSERT multi-fila
 * con placeholders generados, todo en una transacción para que un fallo a
 * mitad no deje el rol sin plantilla.
 *
 * @throws {Error} 404 inexistente, 400 si el rol es PERSONALIZADO.
 */
export async function asignarPermisosRol(id, permisos) {
  const rol = await obtenerRolPorId(id);
  if (!rol) throw error404('Rol no encontrado');

  if (rol.tipo !== 'SISTEMA') {
    throw error400('No se puede asignar plantilla a un rol PERSONALIZADO');
  }

  const ids = normalizarIds(permisos);

  // El DELETE + INSERT deben ser atómicos: si el INSERT falla a medias, el rol
  // se quedaría sin plantilla en lugar de con la anterior.
  await withTransaction(async (conexion) => {
    await conexion.query('DELETE FROM roles_permisos WHERE rol_id = ?', [id]);

    if (ids.length > 0) {
      const placeholders = ids.map(() => '(?, ?)').join(', ');
      const params = ids.flatMap((p) => [id, p]);
      await conexion.query(
        `INSERT INTO roles_permisos (rol_id, permiso_id) VALUES ${placeholders}`,
        params
      );
    }
  });

  return true;
}

/**
 * Quita un permiso de la plantilla del rol.
 * @throws {Error} 404 rol inexistente o permiso no asignado.
 */
export async function quitarPermisoDeRol(id, permisoId) {
  const rol = await obtenerRolPorId(id);
  if (!rol) throw error404('Rol no encontrado');

  const [result] = await pool.query(
    'DELETE FROM roles_permisos WHERE rol_id = ? AND permiso_id = ?',
    [id, permisoId]
  );

  if (result.affectedRows === 0) {
    throw error404('El rol no tiene ese permiso asignado');
  }
  return true;
}

/** Descarta ids no numéricos y deduplica, preservando el orden de entrada. */
function normalizarIds(permisos) {
  if (!Array.isArray(permisos)) return [];
  const vistos = new Set();
  for (const valor of permisos) {
    const id = Number(valor && valor.permiso_id !== undefined ? valor.permiso_id : valor);
    if (Number.isInteger(id) && id > 0) vistos.add(id);
  }
  return [...vistos];
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