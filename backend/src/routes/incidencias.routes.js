import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import {
  listar,
  obtenerPorId,
  crear,
  cerrar,
  eliminar,
} from '../controllers/incidenciasController.js';

const router = Router();

const crearIncidenciaValidation = [
  body('tipo_centro')
    .isIn(['DISTRIBUCION', 'TRANSFERENCIA'])
    .withMessage('Tipo centro debe ser DISTRIBUCION o TRANSFERENCIA'),
  body('centro').notEmpty().trim().escape(),
  body('sistema').notEmpty().trim().escape(),
  body('incidencia').notEmpty().trim().escape(),
  body('ticket').notEmpty().isLength({ max: 59 }).trim().escape(),
  body('responsable').notEmpty().isLength({ max: 60 }).trim().escape(),
  body('descripcion').notEmpty().isLength({ max: 255 }).trim().escape(),
];

router.get('/', requireAuth, requirePermission('VER_INCIDENCIAS'), listar);
router.get('/:id', requireAuth, requirePermission('VER_INCIDENCIAS'), obtenerPorId);
router.post('/', requireAuth, requirePermission('CREAR_INCIDENCIA'), crearIncidenciaValidation, crear);
router.patch('/:id/cerrar', requireAuth, requirePermission('MODIFICAR_INCIDENCIA'), cerrar);
router.delete('/:id', requireAuth, requirePermission('ELIMINAR_INCIDENCIA'), eliminar);

export default router;
