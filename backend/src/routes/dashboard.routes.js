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
} from '../controllers/dashboardController.js';

const router = Router();

// Dashboard usa VER_INCIDENCIAS según especificación
router.get('/kpis', requireAuth, requirePermission('VER_INCIDENCIAS'), obtenerKPIs);
router.get('/por-dia', requireAuth, requirePermission('VER_INCIDENCIAS'), incidenciasPorDia);
router.get('/por-sistema', requireAuth, requirePermission('VER_INCIDENCIAS'), porSistema);
router.get('/por-tipo-centro', requireAuth, requirePermission('VER_INCIDENCIAS'), porTipoCentro);
router.get('/por-centro', requireAuth, requirePermission('VER_INCIDENCIAS'), porCentro);
router.get('/por-tipo-incidencia', requireAuth, requirePermission('VER_INCIDENCIAS'), porTipoIncidencia);
router.get('/por-responsable', requireAuth, requirePermission('VER_INCIDENCIAS'), porResponsable);
router.get('/heatmap', requireAuth, requirePermission('VER_INCIDENCIAS'), heatmap);

export default router;
