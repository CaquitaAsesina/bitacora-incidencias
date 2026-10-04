import { validationResult } from 'express-validator';
import incidenciasService from '../services/incidenciasService.js';

export async function listar(req, res, next) {
  try {
    const {
      fecha_desde,
      fecha_hasta,
      centro,
      tipo_centro,
      sistema,
      incidencia,
      usuario_id,
      responsable_texto,
      estado,
      q,
      page = 1,
      limit = 10,
    } = req.query;

    const filtros = {
      fecha_desde,
      fecha_hasta,
      centro,
      tipo_centro,
      sistema,
      incidencia,
      usuario_id,
      responsable_texto,
      estado,
      q,
    };

    const resultado = await incidenciasService.listarIncidencias(filtros, page, limit);

    res.json({
      ok: true,
      ...resultado,
    });
  } catch (error) {
    next(error);
  }
}

export async function obtenerPorId(req, res, next) {
  try {
    const { id } = req.params;
    const incidencia = await incidenciasService.obtenerIncidenciaPorId(id);

    if (!incidencia) {
      return res.status(404).json({ ok: false, mensaje: 'Incidencia no encontrada' });
    }

    res.json({ ok: true, data: incidencia });
  } catch (error) {
    next(error);
  }
}

export async function valoresSugeridos(req, res, next) {
  try {
    const data = await incidenciasService.obtenerValoresSugeridos();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

export async function descartarSugerido(req, res, next) {
  try {
    const { campo, valor } = req.body;
    await incidenciasService.descartarValorSugerido(campo, valor);
    res.json({ ok: true, mensaje: 'Valor quitado de las sugerencias' });
  } catch (error) {
    next(error);
  }
}

export async function restaurarSugerido(req, res, next) {
  try {
    const { campo, valor } = req.body;
    await incidenciasService.restaurarValorSugerido(campo, valor);
    res.json({ ok: true, mensaje: 'Valor restaurado en las sugerencias' });
  } catch (error) {
    next(error);
  }
}

export async function crear(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, errors: errors.array() });
    }

    const usuarioIdSesion = req.session.userId;

    const incidencia = await incidenciasService.crearIncidencia(req.body, usuarioIdSesion);

    res.status(201).json({ ok: true, data: incidencia });
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, errors: errors.array() });
    }

    const { id } = req.params;
    const usuarioIdSesion = req.session.userId;

    const incidencia = await incidenciasService.actualizarIncidencia(id, req.body, usuarioIdSesion);

    res.json({ ok: true, data: incidencia });
  } catch (error) {
    next(error);
  }
}

export async function cerrar(req, res, next) {
  try {
    const { id } = req.params;
    const usuarioIdSesion = req.session.userId;

    const incidencia = await incidenciasService.cerrarIncidencia(id, usuarioIdSesion);

    res.json({ ok: true, data: incidencia });
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req, res, next) {
  try {
    const { id } = req.params;
    await incidenciasService.eliminarIncidencia(id);

    res.json({ ok: true, mensaje: 'Incidencia eliminada correctamente' });
  } catch (error) {
    next(error);
  }
}
