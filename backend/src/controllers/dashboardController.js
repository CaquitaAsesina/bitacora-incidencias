import dashboardService from '../services/dashboardService.js';

export async function obtenerKPIs(req, res, next) {
  try {
    const data = await dashboardService.obtenerKPIs(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

export async function incidenciasPorDia(req, res, next) {
  try {
    const dias = req.query.dias || 30;
    const data = await dashboardService.incidenciasPorDia(dias);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

export async function porSistema(req, res, next) {
  try {
    const data = await dashboardService.porSistema(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

export async function porTipoCentro(req, res, next) {
  try {
    const data = await dashboardService.porTipoCentro(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

export async function porCentro(req, res, next) {
  try {
    const data = await dashboardService.porCentro(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

export async function porTipoIncidencia(req, res, next) {
  try {
    const data = await dashboardService.porTipoIncidencia(req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

export async function porResponsable(req, res, next) {
  try {
    const data = await dashboardService.porResponsable();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

export async function porTiempoSolucion(req, res, next) {
  try {
    const limite = req.query.limite || 30;
    const data = await dashboardService.porTiempoSolucion(limite, req.query);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

export async function heatmap(req, res, next) {
  try {
    const data = await dashboardService.heatmap();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}
