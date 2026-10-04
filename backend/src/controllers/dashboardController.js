/**
 * =====================================================================
 * controllers/dashboardController.js — Dashboard analítico
 * =====================================================================
 * Un handler por gráfico/tarjeta del dashboard. Todos delegan en
 * dashboardService y devuelven { ok:true, data }.
 *
 * Todos los endpoints exigen el permiso VER_DASHBOARD (ver dashboard.routes.js).
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
    const dias = req.query.dias || 30;
    const data = await dashboardService.incidenciasPorDia(dias);
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

/** GET /api/dashboard/por-tipo-centro — distribución DISTRIBUCION/TRANSFERENCIA. */
export async function porTipoCentro(req, res, next) {
  try {
    const data = await dashboardService.porTipoCentro(req.query);
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
 * GET /api/dashboard/por-responsable — top responsables por usuario_id.
 * NOTA: disponible para un gráfico futuro (hoy el frontend no lo consume).
 */
export async function porResponsable(req, res, next) {
  try {
    const data = await dashboardService.porResponsable();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/** GET /api/dashboard/por-tiempo-solucion — serie de tiempos de solución. */
export async function porTiempoSolucion(req, res, next) {
  try {
    const limite = req.query.limite || 30;
    const data = await dashboardService.porTiempoSolucion(limite, req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/heatmap — matriz día/hora de incidencias.
 * NOTA: disponible para un gráfico futuro (hoy el frontend no lo consume).
 */
export async function heatmap(req, res, next) {
  try {
    const data = await dashboardService.heatmap();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}
