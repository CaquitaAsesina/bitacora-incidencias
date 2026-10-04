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
import { listar } from '../controllers/incidenciasController.js';

const router = Router();

// Dashboard usa VER_INCIDENCIAS según especificación
router.get('/', requireAuth, requirePermission('VER_DASHBOARD'), listar);
router.get('/kpis', requireAuth, requirePermission('VER_DASHBOARD'), obtenerKPIs);
router.get('/por-dia', requireAuth, requirePermission('VER_DASHBOARD'), incidenciasPorDia);
router.get('/por-sistema', requireAuth, requirePermission('VER_DASHBOARD'), porSistema);
router.get('/por-centro', requireAuth, requirePermission('VER_DASHBOARD'), porCentro);
router.get('/por-tipo-incidencia', requireAuth, requirePermission('VER_DASHBOARD'), porTipoIncidencia);
router.get('/por-responsable', requireAuth, requirePermission('VER_DASHBOARD'), porResponsable);
router.get('/heatmap', requireAuth, requirePermission('VER_DASHBOARD'), heatmap);
router.get('/por-tiempo-solucion', requireAuth, requirePermission('VER_DASHBOARD'), porTiempoSolucion);

export default router;
