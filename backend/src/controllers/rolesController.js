/**
 * =====================================================================
 * controllers/rolesController.js — Roles del sistema
 * =====================================================================
 * CRUD de roles + permisos del rol + usuarios que lo tienen.
 * Delega toda la lógica en rolesService.
 *
 * Para extender: añade la función aquí y regístrala en routes/roles.routes.js.
 * =====================================================================
 */
import rolesService from '../services/rolesService.js';

/** GET /api/roles — lista roles con auditoría y conteos. Acepta ?tipo=SISTEMA|PERSONALIZADO. */
export async function listar(req, res, next) {
  try {
    const roles = await rolesService.listarRoles(req.query);
    res.json({ ok: true, data: roles });
  } catch (error) {
    next(error);
  }
}

/** POST /api/roles — crea un rol. */
export async function crear(req, res, next) {
  try {
    const rol = await rolesService.crearRol(req.body, req.session.userId);
    res.status(201).json({ ok: true, data: rol });
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/roles/:id — renombra/cambia tipo de un rol. */
export async function actualizar(req, res, next) {
  try {
    const { id } = req.params;
    const rol = await rolesService.actualizarRol(id, req.body, req.session.userId);
    res.json({ ok: true, data: rol });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/roles/:id — elimina un rol. */
export async function eliminar(req, res, next) {
  try {
    const { id } = req.params;
    await rolesService.eliminarRol(id);
    res.json({ ok: true, mensaje: 'Rol eliminado' });
  } catch (error) {
    next(error);
  }
}

/** GET /api/roles/:id/usuarios — usuarios que tienen el rol. */
export async function listarUsuariosDeRol(req, res, next) {
  try {
    const { id } = req.params;
    const usuarios = await rolesService.listarUsuariosDeRol(id);
    res.json({ ok: true, data: usuarios });
  } catch (error) {
    next(error);
  }
}

/** GET /api/roles/:id/permisos — permisos asignados al rol. */
export async function listarPermisos(req, res, next) {
  try {
    const { id } = req.params;
    const permisos = await rolesService.listarPermisosDeRol(id);
    res.json({ ok: true, data: permisos });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/roles/:id/permisos/:pid — quita un permiso del rol. */
export async function quitarPermiso(req, res, next) {
  try {
    const { id, pid } = req.params;
    await rolesService.quitarPermisoDeRol(id, pid);
    res.json({ ok: true, mensaje: 'Permiso quitado del rol' });
  } catch (error) {
    next(error);
  }
}

/** POST /api/roles/:id/permisos — reemplaza los permisos del rol. */
export async function asignarPermisos(req, res, next) {
  try {
    const { id } = req.params;
    const { permisos } = req.body;
    await rolesService.asignarPermisosRol(id, permisos);
    res.json({ ok: true, mensaje: 'Permisos asignados al rol' });
  } catch (error) {
    next(error);
  }
}
