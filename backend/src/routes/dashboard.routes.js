/**
 * =====================================================================
 * routes/dashboard.routes.js — Dashboard (/api/dashboard)
 * =====================================================================
 * TODAS las rutas exigen VER_DASHBOARD (módulo exclusivo).
 *
 * Nota: /por-dia, /por-responsable y /heatmap están disponibles para gráficos
 * futuros; el frontend actual solo consume kpis, por-sistema, por-tipo-centro,
 * por-centro, por-tipo-incidencia y por-tiempo-solucion.
 * =====================================================================
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import {
  obtenerKPIs,
  incidenciasPorDia,
  porSistema,
  porTipoCentro,
  porCentro,
  porTipoIncidencia,
  porResponsable,
  heatmap,
  porTiempoSolucion,
} from '../controllers/dashboardController.js';

const router = Router();

// Todo el Dashboard requiere exclusivamente el permiso VER_DASHBOARD
// (formato: router.<metodo>(ruta, requireAuth, requirePermission(...), controller))
router.get('/kpis', requireAuth, requirePermission('VER_DASHBOARD'), obtenerKPIs);
router.get('/por-dia', requireAuth, requirePermission('VER_DASHBOARD'), incidenciasPorDia);
router.get('/por-sistema', requireAuth, requirePermission('VER_DASHBOARD'), porSistema);
router.get('/por-tipo-centro', requireAuth, requirePermission('VER_DASHBOARD'), porTipoCentro);
router.get('/por-centro', requireAuth, requirePermission('VER_DASHBOARD'), porCentro);
router.get('/por-tipo-incidencia', requireAuth, requirePermission('VER_DASHBOARD'), porTipoIncidencia);
router.get('/por-responsable', requireAuth, requirePermission('VER_DASHBOARD'), porResponsable);
router.get('/heatmap', requireAuth, requirePermission('VER_DASHBOARD'), heatmap);
router.get('/por-tiempo-solucion', requireAuth, requirePermission('VER_DASHBOARD'), porTiempoSolucion);

export default router;
