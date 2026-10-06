/**
 * =====================================================================
 * routes/dashboard.routes.js — Dashboard (/api/dashboard)
 * =====================================================================
 * TODAS las rutas exigen VER_DASHBOARD (módulo exclusivo).
 *
 * Cada endpoint acepta los mismos filtros (fecha_desde, fecha_hasta, centro,
 * sistema, incidencia, responsable, estado, creado_por) para que las cifras
 * de las tarjetas y los gráficos provengan siempre del mismo subconjunto.
 *
 * `/por-tipo-centro` ya no existe: `tipo_centro` se eliminó del schema.
 * En su lugar quedan `/por-autor` (auditoría real, `creado_por`) y
 * `/por-responsable` (responsable de negocio, texto libre).
 * =====================================================================
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import {
  obtenerKPIs,
  incidenciasPorDia,
  porSistema,
  porCentro,
  porTipoIncidencia,
  porResponsable,
  porAutor,
  porEstado,
  heatmap,
  porTiempoSolucion,
  metadatos,
} from '../controllers/dashboardController.js';

const router = Router();

// Todo el Dashboard requiere exclusivamente el permiso VER_DASHBOARD
// (formato: router.<metodo>(ruta, requireAuth, requirePermission(...), controller))
const soloDashboard = requirePermission('VER_DASHBOARD');

router.get('/kpis', requireAuth, soloDashboard, obtenerKPIs);
router.get('/por-dia', requireAuth, soloDashboard, incidenciasPorDia);
router.get('/por-sistema', requireAuth, soloDashboard, porSistema);
router.get('/por-centro', requireAuth, soloDashboard, porCentro);
router.get('/por-tipo-incidencia', requireAuth, soloDashboard, porTipoIncidencia);
router.get('/por-responsable', requireAuth, soloDashboard, porResponsable);
router.get('/por-autor', requireAuth, soloDashboard, porAutor);
router.get('/por-estado', requireAuth, soloDashboard, porEstado);
router.get('/heatmap', requireAuth, soloDashboard, heatmap);
router.get('/por-tiempo-solucion', requireAuth, soloDashboard, porTiempoSolucion);
router.get('/metadatos', requireAuth, soloDashboard, metadatos);

export default router;