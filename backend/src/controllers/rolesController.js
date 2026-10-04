import rolesService from '../services/rolesService.js';

export async function listar(req, res, next) {
  try {
    const roles = await rolesService.listarRoles();
    res.json({ ok: true, data: roles });
  } catch (error) {
    next(error);
  }
}

export async function crear(req, res, next) {
  try {
    const rol = await rolesService.crearRol(req.body);
    res.status(201).json({ ok: true, data: rol });
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req, res, next) {
  try {
    const { id } = req.params;
    const rol = await rolesService.actualizarRol(id, req.body);
    res.json({ ok: true, data: rol });
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req, res, next) {
  try {
    const { id } = req.params;
    await rolesService.eliminarRol(id);
    res.json({ ok: true, mensaje: 'Rol eliminado' });
  } catch (error) {
    next(error);
  }
}

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
