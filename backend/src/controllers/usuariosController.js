/**
 * =====================================================================
 * controllers/usuariosController.js — Usuarios, roles y permisos por usuario
 * =====================================================================
 * CRUD de usuarios y asignación de roles/permisos a cada usuario.
 * Delega toda la lógica en usuariosService.
 *
 * La auditoría (`creado_por` / `actualizado_por`) se toma de req.session.userId
 * y se pasa al servicio: el body nunca la decide.
 *
 * Para extender: añade la función aquí y regístrala en routes/usuarios.routes.js.
 * =====================================================================
 */
import usuariosService from '../services/usuariosService.js';

/**
 * GET /api/usuarios — lista usuarios con roles, auditoría y conteos.
 * Acepta filtros de query: habilitado, creado_desde, creado_hasta, rol_id, q,
 * orden (lista blanca resuelta en el servicio).
 */
export async function listar(req, res, next) {
  try {
    const usuarios = await usuariosService.listarUsuarios(req.query);
    res.json({ ok: true, data: usuarios });
  } catch (error) {
    next(error);
  }
}

/** GET /api/usuarios/:id — detalle de un usuario. */
export async function obtenerPorId(req, res, next) {
  try {
    const { id } = req.params;
    const usuario = await usuariosService.obtenerUsuarioPorId(id);

    if (!usuario) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    res.json({ ok: true, data: usuario });
  } catch (error) {
    next(error);
  }
}

/** POST /api/usuarios — crea un usuario (auditoría = usuario de la sesión). */
export async function crear(req, res, next) {
  try {
    const usuario = await usuariosService.crearUsuario(req.body, req.session.userId);
    res.status(201).json({ ok: true, data: usuario });
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/usuarios/:id — actualiza un usuario (refresca actualizado_por). */
export async function actualizar(req, res, next) {
  try {
    const { id } = req.params;
    const usuario = await usuariosService.actualizarUsuario(id, req.body, req.session.userId);
    res.json({ ok: true, data: usuario });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/usuarios/:id — elimina si no tiene incidencias vinculadas. */
export async function eliminar(req, res, next) {
  try {
    const { id } = req.params;
    await usuariosService.eliminarUsuario(id);
    res.json({ ok: true, mensaje: 'Usuario eliminado' });
  } catch (error) {
    next(error);
  }
}

/** GET /api/usuarios/:id/roles — roles del usuario. */
export async function listarRoles(req, res, next) {
  try {
    const { id } = req.params;
    const roles = await usuariosService.listarRolesDeUsuario(id);
    res.json({ ok: true, data: roles });
  } catch (error) {
    next(error);
  }
}

/** POST /api/usuarios/:id/roles — asigna un rol al usuario. */
export async function asignarRol(req, res, next) {
  try {
    const { id } = req.params;
    const { rol_id } = req.body;
    await usuariosService.asignarRol(id, rol_id);
    res.json({ ok: true, mensaje: 'Rol asignado correctamente' });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/usuarios/:id/roles/:rid — quita un rol al usuario. */
export async function quitarRol(req, res, next) {
  try {
    const { id, rid } = req.params;
    await usuariosService.quitarRol(id, rid);
    res.json({ ok: true, mensaje: 'Rol quitado correctamente' });
  } catch (error) {
    next(error);
  }
}

/** GET /api/usuarios/:uid/roles/:rid/permisos — permisos personalizados del par. */
export async function listarPermisosDeUsuarioRol(req, res, next) {
  try {
    const { uid, rid } = req.params;
    const permisos = await usuariosService.listarPermisosDeUsuarioRol(uid, rid);
    res.json({ ok: true, data: permisos });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/usuarios/:uid/roles/:rid/permisos/:pid — quita un permiso del par. */
export async function quitarPermisoDeUsuarioRol(req, res, next) {
  try {
    const { uid, rid, pid } = req.params;
    await usuariosService.quitarPermisoDeUsuarioRol(uid, rid, pid);
    res.json({ ok: true, mensaje: 'Permiso quitado correctamente' });
  } catch (error) {
    next(error);
  }
}

/** GET /api/usuarios/:id/permisos-personalizados — resuelve el rol PERSONALIZADO y sus permisos. */
export async function verRolPersonalizado(req, res, next) {
  try {
    const { id } = req.params;
    const data = await usuariosService.obtenerRolPersonalizadoConPermisos(id);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/** POST /api/usuarios/:id/permisos-personalizados — asigna permisos al rol PERSONALIZADO del usuario. */
export async function asignarPermisosPorUsuario(req, res, next) {
  try {
    const { id } = req.params;
    const { permisos } = req.body;
    const rol = await usuariosService.asignarPermisosPersonalizadosPorUsuario(id, permisos);
    res.json({
      ok: true,
      mensaje: `Permisos asignados al rol PERSONALIZADO ${rol.nombre}`,
      data: { rol },
    });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/usuarios/:id/permisos-personalizados/:pid — quita un permiso al usuario. */
export async function quitarPermisoPorUsuario(req, res, next) {
  try {
    const { id, pid } = req.params;
    await usuariosService.quitarPermisoPersonalizadoPorUsuario(id, pid);
    res.json({ ok: true, mensaje: 'Permiso quitado al usuario' });
  } catch (error) {
    next(error);
  }
}

/** POST /api/usuarios/:uid/roles/:rid/permisos — permisos personalizados del par (Lógica B). */
export async function asignarPermisosPersonalizados(req, res, next) {
  try {
    const { uid, rid } = req.params;
    const { permisos } = req.body;
    await usuariosService.asignarPermisosPersonalizados(uid, rid, permisos);
    res.json({ ok: true, mensaje: 'Permisos personalizados asignados' });
  } catch (error) {
    next(error);
  }
}