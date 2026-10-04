import permisosService from '../services/permisosService.js';

export async function listar(req, res, next) {
  try {
    const permisos = await permisosService.listarPermisos();
    res.json({ ok: true, data: permisos });
  } catch (error) {
    next(error);
  }
}

export async function crear(req, res, next) {
  try {
    const { nombre } = req.body;
    const permiso = await permisosService.crearPermiso(nombre);
    res.status(201).json({ ok: true, data: permiso });
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req, res, next) {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    const permiso = await permisosService.actualizarPermiso(id, nombre);
    res.json({ ok: true, data: permiso });
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req, res, next) {
  try {
    const { id } = req.params;
    await permisosService.eliminarPermiso(id);
    res.json({ ok: true, mensaje: 'Permiso eliminado' });
  } catch (error) {
    next(error);
  }
}

export async function asignarPermisosUsuarioRol(req, res, next) {
  try {
    const { uid, rid } = req.params;
    const { permisos } = req.body;
    await permisosService.asignarPermisosAUsuarioRol(uid, rid, permisos);
    res.json({ ok: true, mensaje: 'Permisos asignados' });
  } catch (error) {
    next(error);
  }
}
