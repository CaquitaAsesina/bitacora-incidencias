/**
 * =====================================================================
 * controllers/dashboardController.js — Dashboard analítico
 * =====================================================================
 * Un handler por gráfico/tarjeta del dashboard. Todos delegan en
 * dashboardService y devuelven { ok:true, data }.
 *
 * Todos los endpoints exigen VER_DASHBOARD (ver dashboard.routes.js) y aceptan
 * los mismos filtros de query, para que las tarjetas y los gráficos cuadren
 * entre sí: fecha_desde, fecha_hasta, centro, sistema, incidencia, responsable,
 * estado, creado_por.
 *
 * `porTipoCentro` desapareció: `tipo_centro` ya no está en el schema.
 *
 * Para extender: añade el handler aquí y su ruta en routes/dashboard.routes.js.
 * =====================================================================
 */
import dashboardService from '../services/dashboardService.js';

/** GET /api/dashboard/kpis — tarjetas resumen (total, abiertas, cerradas...). */
export async function obtenerKPIs(req, res, next) {
  try {
    const data = await dashboardService.obtenerKPIs(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/** GET /api/dashboard/por-dia — incidencias creadas/cerradas por día. */
export async function incidenciasPorDia(req, res, next) {
  try {
    const data = await dashboardService.incidenciasPorDia(req.query.dias || 30, req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/** GET /api/dashboard/por-sistema — top sistemas con más incidencias. */
export async function porSistema(req, res, next) {
  try {
    const data = await dashboardService.porSistema(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/** GET /api/dashboard/por-centro — incidencias por centro (abiertas/cerradas). */
export async function porCentro(req, res, next) {
  try {
    const data = await dashboardService.porCentro(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/** GET /api/dashboard/por-tipo-incidencia — incidencias por tipo. */
export async function porTipoIncidencia(req, res, next) {
  try {
    const data = await dashboardService.porTipoIncidencia(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/por-responsable — top responsables.
 * `responsable` es texto libre en el schema (dato del negocio), no un usuario
 * del sistema; el ranking de autores reales está en /por-autor.
 */
export async function porResponsable(req, res, next) {
  try {
    const data = await dashboardService.porResponsable(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/por-autor — ranking de autores reales.
 * Es la lectura directa de la auditoría del schema (`creado_por`), que antes
 * se agrupaba por el eliminado `usuario_id`.
 */
export async function porAutor(req, res, next) {
  try {
    const data = await dashboardService.porAutor(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/** GET /api/dashboard/por-estado — abiertas vs cerradas. */
export async function porEstado(req, res, next) {
  try {
    const data = await dashboardService.porEstado(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/** GET /api/dashboard/por-tiempo-solucion — serie de tiempos de solución. */
export async function porTiempoSolucion(req, res, next) {
  try {
    const data = await dashboardService.porTiempoSolucion(req.query.limite || 30, req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/** GET /api/dashboard/heatmap — matriz día/hora de incidencias. */
export async function heatmap(req, res, next) {
  try {
    const data = await dashboardService.heatmap(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/metadatos — valores existentes de cada dimensión, autores
 * y rango de fechas con datos. Permite llenar los desplegables de filtro desde
 * la base en vez de mantener catálogos duplicados en el frontend.
 */
export async function metadatos(req, res, next) {
  try {
    const data = await dashboardService.obtenerMetadatos();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}