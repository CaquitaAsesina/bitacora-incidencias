/**
 * =====================================================================
 * routes/incidencias.routes.js — Bitácora (/api/incidencias)
 * =====================================================================
 * Guards por operación (nombres exactos del catálogo en schema.sql):
 *   listar/detalle/sugeridos -> VER_INCIDENCIAS
 *   crear                    -> CREAR_INCIDENCIAS
 *   modificar/cerrar         -> MODIFICAR_INCIDENCIAS
 *   eliminar                 -> ELIMINAR_INCIDENCIAS
 *
 * El cierre se hace vía PATCH /:id con { cerrar: true }; PATCH /:id/cerrar
 * queda disponible para cerrarla sin editar el resto de campos.
 *
 * `tipo_centro` y `fecha` ya no existen en el schema. La fecha de registro es
 * `creado_en` (lo define el servidor al crear) y solo se puede ajustar al
 * editar. `hora_inicio` se registra sola al crear (CURRENT_TIME del servidor).
 * Las columnas de auditoría (`creado_por`, `actualizado_por`) se rechazan
 * explícitamente en el body: las firma el usuario de la sesión.
 * =====================================================================
 */
import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import { checkValidation, idNumerico } from '../middlewares/validacion.js';
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

const HORA_HHMMSS = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;

/**
 * Rechaza que el cliente intente escribir la auditoría a mano.
 * Sin esto, un POST/PATCH podría suplantar al autor de la incidencia.
 */
const sinAuditoria = (campo) =>
  body(campo)
    .not()
    .exists()
    .withMessage(`El campo ${campo} lo define el servidor y no puede enviarse`);

const crearIncidenciaValidation = [
  body('centro').notEmpty().trim().escape(),
  body('sistema').notEmpty().trim().escape(),
  body('incidencia').notEmpty().trim().escape(),
  body('ticket').notEmpty().isLength({ max: 59 }).trim().escape(),
  body('responsable').notEmpty().isLength({ max: 60 }).trim().escape(),
  body('descripcion').notEmpty().isLength({ max: 255 }).trim().escape(),
  sinAuditoria('creado_por'),
  sinAuditoria('actualizado_por'),
];

const cerrarIncidenciaValidation = [
  body('hora_fin')
    .optional({ values: 'falsy' })
    .matches(HORA_HHMMSS)
    .withMessage('Hora de fin inválida'),
];

const actualizarIncidenciaValidation = [
  body('centro').optional().notEmpty().trim().escape(),
  body('sistema').optional().notEmpty().trim().escape(),
  body('incidencia').optional().notEmpty().trim().escape(),
  body('ticket').optional().notEmpty().isLength({ max: 59 }).trim().escape(),
  body('responsable').optional().notEmpty().isLength({ max: 60 }).trim().escape(),
  body('descripcion').optional().notEmpty().isLength({ max: 255 }).trim().escape(),
  body('creado_en')
    .optional({ values: 'falsy' })
    .matches(DATETIME_LOCAL)
    .withMessage('El campo registrado en debe ser una fecha y hora válida (YYYY-MM-DDTHH:MM)'),
  body('hora_inicio')
    .optional({ values: 'falsy' })
    .matches(HORA_HHMMSS)
    .withMessage('Hora de inicio inválida'),
  body('hora_fin')
    .optional({ values: 'falsy' })
    .matches(HORA_HHMMSS)
    .withMessage('Hora de fin inválida'),
  body('cerrar')
    .optional()
    .isBoolean()
    .withMessage('El campo cerrar debe ser booleano'),
  sinAuditoria('creado_por'),
  sinAuditoria('actualizado_por'),
];

router.get('/', requireAuth, requirePermission('VER_INCIDENCIAS'), listar);
router.get('/valores-sugeridos', requireAuth, requirePermission('VER_INCIDENCIAS'), valoresSugeridos);
router.get('/:id', requireAuth, requirePermission('VER_INCIDENCIAS'), idNumerico('id'), obtenerPorId);
router.post(
  '/',
  requireAuth,
  requirePermission('CREAR_INCIDENCIAS'),
  crearIncidenciaValidation,
  checkValidation,
  crear
);
router.patch(
  '/:id',
  requireAuth,
  requirePermission('MODIFICAR_INCIDENCIAS'),
  idNumerico('id'),
  actualizarIncidenciaValidation,
  checkValidation,
  actualizar
);
router.patch(
  '/:id/cerrar',
  requireAuth,
  requirePermission('MODIFICAR_INCIDENCIAS'),
  idNumerico('id'),
  cerrarIncidenciaValidation,
  checkValidation,
  cerrar
);
router.delete(
  '/:id',
  requireAuth,
  requirePermission('ELIMINAR_INCIDENCIAS'),
  idNumerico('id'),
  eliminar
);

export default router;