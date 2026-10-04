import usuariosService from '../services/usuariosService.js';

export async function listar(req, res, next) {
  try {
    const usuarios = await usuariosService.listarUsuarios();
    res.json({ ok: true, data: usuarios });
  } catch (error) {
    next(error);
  }
}

export async function crear(req, res, next) {
  try {
    const usuario = await usuariosService.crearUsuario(req.body);
    res.status(201).json({ ok: true, data: usuario });
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req, res, next) {
  try {
    const { id } = req.params;
    const usuario = await usuariosService.actualizarUsuario(id, req.body);
    res.json({ ok: true, data: usuario });
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req, res, next) {
  try {
    const { id } = req.params;
    await usuariosService.eliminarUsuario(id);
    res.json({ ok: true, mensaje: 'Usuario eliminado' });
  } catch (error) {
    next(error);
  }
}

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
