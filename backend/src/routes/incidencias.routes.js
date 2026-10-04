import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import {
  listar,
  obtenerPorId,
  valoresSugeridos,
  descartarSugerido,
  restaurarSugerido,
  crear,
  actualizar,
  cerrar,
  eliminar,
} from '../controllers/incidenciasController.js';

const router = Router();

const sugeridosValidation = [
  body('campo')
    .isIn(['centro', 'sistema', 'incidencia', 'responsable'])
    .withMessage('Campo debe ser centro, sistema, incidencia o responsable'),
  body('valor').notEmpty().trim().isLength({ max: 60 }).escape(),
];

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

const actualizarIncidenciaValidation = [
  body('tipo_centro')
    .optional()
    .isIn(['DISTRIBUCION', 'TRANSFERENCIA'])
    .withMessage('Tipo centro debe ser DISTRIBUCION o TRANSFERENCIA'),
  body('centro').optional().notEmpty().trim().escape(),
  body('sistema').optional().notEmpty().trim().escape(),
  body('incidencia').optional().notEmpty().trim().escape(),
  body('ticket').optional().notEmpty().isLength({ max: 59 }).trim().escape(),
  body('responsable').optional().notEmpty().isLength({ max: 60 }).trim().escape(),
  body('descripcion').optional().notEmpty().isLength({ max: 255 }).trim().escape(),
  body('hora_fin')
    .optional({ values: 'falsy' })
    .matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
    .withMessage('Hora de fin inválida'),
];

router.get('/', requireAuth, requirePermission('VER_INCIDENCIAS'), listar);
router.get('/valores-sugeridos', requireAuth, requirePermission('VER_INCIDENCIAS'), valoresSugeridos);
router.post(
  '/valores-sugeridos/descartar',
  requireAuth,
  requirePermission('MODIFICAR_INCIDENCIA'),
  sugeridosValidation,
  descartarSugerido
);
router.post(
  '/valores-sugeridos/restaurar',
  requireAuth,
  requirePermission('MODIFICAR_INCIDENCIA'),
  sugeridosValidation,
  restaurarSugerido
);
router.get('/:id', requireAuth, requirePermission('VER_INCIDENCIAS'), obtenerPorId);
router.post('/', requireAuth, requirePermission('CREAR_INCIDENCIA'), crearIncidenciaValidation, crear);
router.patch('/:id', requireAuth, requirePermission('MODIFICAR_INCIDENCIA'), actualizarIncidenciaValidation, actualizar);
router.patch('/:id/cerrar', requireAuth, requirePermission('MODIFICAR_INCIDENCIA'), cerrar);
router.delete('/:id', requireAuth, requirePermission('ELIMINAR_INCIDENCIA'), eliminar);

export default router;