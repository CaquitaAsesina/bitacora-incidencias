/**
 * =====================================================================
 * routes/incidencias.routes.js — Bitácora (/api/incidencias)
 * =====================================================================
 * Guards por operación:
 *   listar/detalle/sugeridos -> VER_INCIDENCIAS
 *   crear                    -> CREAR_INCIDENCIA
 *   modificar/cerrar         -> MODIFICAR_INCIDENCIA
 *   eliminar                 -> ELIMINAR_INCIDENCIA
 *
 * El cierre se hace vía PATCH /:id con { cerrar: true }; PATCH /:id/cerrar
 * queda disponible para usarlo directo desde otro cliente.
 * =====================================================================
 */
import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import {
  listar,
  obtenerPorId,
  valoresSugeridos,
  crear,
  actualizar,
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
  body('fecha')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Fecha inválida'),
  body('hora_inicio')
    .optional({ values: 'falsy' })
    .matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
    .withMessage('Hora de inicio inválida'),
  body('hora_fin')
    .optional({ values: 'falsy' })
    .matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
    .withMessage('Hora de fin inválida'),
];

router.get('/', requireAuth, requirePermission('VER_INCIDENCIAS'), listar);
router.get('/valores-sugeridos', requireAuth, requirePermission('VER_INCIDENCIAS'), valoresSugeridos);
router.get('/:id', requireAuth, requirePermission('VER_INCIDENCIAS'), obtenerPorId);
router.post('/', requireAuth, requirePermission('CREAR_INCIDENCIA'), crearIncidenciaValidation, crear);
router.patch('/:id', requireAuth, requirePermission('MODIFICAR_INCIDENCIA'), actualizarIncidenciaValidation, actualizar);
router.patch('/:id/cerrar', requireAuth, requirePermission('MODIFICAR_INCIDENCIA'), cerrar);
router.delete('/:id', requireAuth, requirePermission('ELIMINAR_INCIDENCIA'), eliminar);

export default router;