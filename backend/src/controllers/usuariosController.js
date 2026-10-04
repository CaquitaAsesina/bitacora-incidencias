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

export async function listarRoles(req, res, next) {
  try {
    const { id } = req.params;
    const roles = await usuariosService.listarRolesDeUsuario(id);
    res.json({ ok: true, data: roles });
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

export async function quitarRol(req, res, next) {
  try {
    const { id, rid } = req.params;
    await usuariosService.quitarRol(id, rid);
    res.json({ ok: true, mensaje: 'Rol quitar correctamente' });
  } catch (error) {
    next(error);
  }
}

export async function listarUsuariosDeRol(req, res, next) {
  try {
    const { id } = req.params;
    const usuarios = await usuariosService.listarUsuariosDeRol(id);
    res.json({ ok: true, data: usuarios });
  } catch (error) {
    next(error);
  }
}

export async function listarPermisosDeUsuarioRol(req, res, next) {
  try {
    const { uid, rid } = req.params;
    const permisos = await usuariosService.listarPermisosDeUsuarioRol(uid, rid);
    res.json({ ok: true, data: permisos });
  } catch (error) {
    next(error);
  }
}

export async function quitarPermisoDeUsuarioRol(req, res, next) {
  try {
    const { uid, rid, pid } = req.params;
    await usuariosService.quitarPermisoDeUsuarioRol(uid, rid, pid);
    res.json({ ok: true, mensaje: 'Permiso quitado correctamente' });
  } catch (error) {
    next(error);
  }
}

export async function verRolPersonalizado(req, res, next) {
  try {
    const { id } = req.params;
    const data = await usuariosService.obtenerRolPersonalizadoConPermisos(id);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

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

export async function quitarPermisoPorUsuario(req, res, next) {
  try {
    const { id, pid } = req.params;
    await usuariosService.quitarPermisoPersonalizadoPorUsuario(id, pid);
    res.json({ ok: true, mensaje: 'Permiso quitado al usuario' });
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
