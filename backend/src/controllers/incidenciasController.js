/**
 * =====================================================================
 * controllers/incidenciasController.js — Bitácora de incidencias
 * =====================================================================
 * Endpoints de listado, detalle, alta, modificación, cierre y borrado, más
 * los valores sugeridos para los campos de autocompletado.
 * Delega la lógica en incidenciasService; aquí solo se leen params/body.
 * La validación del body la rechazan las rutas con checkValidation
 * (middlewares/validacion.js) y el id con idNumerico.
 *
 * ALINEADO CON schema.sql:
 *   - Ya no existen `tipo_centro` ni `usuario_id`: los autores son las columnas
 *     auditadas `creado_por` / `actualizado_por`, ambas alimentadas por la
 *     sesión, nunca por el body.
 *   - `responsable` es texto libre (no un id de usuario), así que el filtro
 *     exacto se llama `responsable` y no `responsable_texto`.
 *   - `creado_por` es un filtro nuevo (ranking de autores).
 *   - `orden` es una lista blanca resuelta en el servicio.
 *
 * Para extender: añade la función aquí y regístrala en routes/incidencias.routes.js.
 * =====================================================================
 */
import incidenciasService from '../services/incidenciasService.js';

/**
 * Filtros del listado, tomados de la query.
 *
 * `centro`, `sistema`, `incidencia` y `responsable` se comparan con igualdad
 * exacta para que el planner use los índices compuestos (columna, creado_en).
 * La búsqueda parcial va aparte en `q`, que sí usa LIKE con comodín inicial.
 */
function filtrosDesdeQuery(query) {
  return {
    fecha_desde: query.fecha_desde,
    fecha_hasta: query.fecha_hasta,
    centro: query.centro,
    sistema: query.sistema,
    incidencia: query.incidencia,
    responsable: query.responsable,
    estado: query.estado,
    creado_por: query.creado_por,
    actualizado_por: query.actualizado_por,
    q: query.q,
    orden: query.orden,
  };
}

/** GET /api/incidencias — listado paginado con filtros. */
export async function listar(req, res, next) {
  try {
    const { page = 1, limit = 10, estado } = req.query;
    const filtros = filtrosDesdeQuery(req.query);

    // El resumen por estado solo tiene sentido si el listado no está filtrado
    // por estado: si el usuario pidió "abiertas", las cerradas valen 0 por
    // definición y no se calcula (el servicio resuelve el coste).
    const resultado = await incidenciasService.listarIncidencias(filtros, page, limit, {
      contarPorEstado: estado === undefined || estado === '',
    });

    res.json({ ok: true, ...resultado });
  } catch (error) {
    next(error);
  }
}

/** GET /api/incidencias/:id — detalle de una incidencia. */
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

/** GET /api/incidencias/valores-sugeridos — valores distintos para autocompletar. */
export async function valoresSugeridos(req, res, next) {
  try {
    const data = await incidenciasService.obtenerValoresSugeridos();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/incidencias — crea una incidencia.
 * `creado_por` y `actualizado_por` los pone el servicio con el usuario de la
 * sesión; el body no puede inyectarlos (la ruta los rechaza).
 */
export async function crear(req, res, next) {
  try {
    const incidencia = await incidenciasService.crearIncidencia(req.body, req.session.userId);
    res.status(201).json({ ok: true, data: incidencia });
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/incidencias/:id — modifica campos y opcionalmente cierra. */
export async function actualizar(req, res, next) {
  try {
    const { id } = req.params;
    const incidencia = await incidenciasService.actualizarIncidencia(
      id,
      req.body,
      req.session.userId
    );

    res.json({ ok: true, data: incidencia });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/incidencias/:id/cerrar — cierra la incidencia.
 * Acepta { hora_fin } opcional; si no llega, el servicio usa NOW().
 * El frontend hoy cierra vía PATCH /:id con { cerrar: true }, pero este
 * endpoint queda disponible para clientes que quieran cerrar sin editar.
 */
export async function cerrar(req, res, next) {
  try {
    const { id } = req.params;
    const incidencia = await incidenciasService.cerrarIncidencia(id, req.session.userId, {
      hora_fin: req.body && req.body.hora_fin,
    });

    res.json({ ok: true, data: incidencia });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/incidencias/:id — elimina una incidencia. */
export async function eliminar(req, res, next) {
  try {
    const { id } = req.params;
    await incidenciasService.eliminarIncidencia(id);

    res.json({ ok: true, mensaje: 'Incidencia eliminada correctamente' });
  } catch (error) {
    next(error);
  }
}