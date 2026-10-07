/**
 * =====================================================================
 * routes/permisos.routes.js — Catálogo de permisos (/api/permisos)
 * =====================================================================
 * Guards por operación (nombres exactos del catálogo en schema.sql):
 *   listar    -> VER_PERMISOS
 *   crear     -> CREAR_PERMISOS
 *   renombrar -> MODIFICAR_PERMISOS
 *   borrar    -> ELIMINAR_PERMISOS
 *   asignar a usuario-rol -> ASIGNAR_PERMISOS
 *
 * Antes editar y borrar exigían CREAR_PERMISOS; con el catálogo nuevo cada
 * operación tiene su propio permiso.
 *
 * El PATCH es un renombrado explícito (no un update parcial): por eso exige
 * `nombre`. La auditoría la firma la sesión, nunca el body.
 * =====================================================================
 */
import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import { checkValidation, idNumerico, idsParUsuarioRol } from '../middlewares/validacion.js';
import {
  listar,
  crear,
  actualizar,
  eliminar,
  asignarPermisosUsuarioRol,
} from '../controllers/permisosController.js';

const router = Router();

const sinAuditoria = [
  body('creado_por')
    .not()
    .exists()
    .withMessage('El campo creado_por lo define el servidor y no puede enviarse'),
  body('actualizado_por')
    .not()
    .exists()
    .withMessage('El campo actualizado_por lo define el servidor y no puede enviarse'),
];

// Alta y renombrado: `nombre` obligatorio. Límite 50 = VARCHAR del catálogo.
const permisoValidation = [
  body('nombre')
    .notEmpty()
    .trim()
    .isLength({ max: 50 })
    .withMessage('El nombre del permiso es obligatorio y no puede superar 50 caracteres'),
  ...sinAuditoria,
];

/**
 * Asignación por par usuario-rol (Lógica B) — cuerpo
 * `{ permisos: [{ permiso_id }] }`.
 *
 * Este endpoint es un alias de `POST /api/usuarios/:id/permisos-personalizados`:
 * ambos delegan en `usuariosService.asignarPermisosPersonalizados()`, que
 * descarta silenciosamente cualquier elemento que no traiga `permiso_id`. Por
 * eso el validador exige el objeto completo: un `number[]` pasaba el chequeo y
 * después se perdía entero. La columna `concedido` ya no existe: la fila es el
 * permiso.
 */
const asignarPermisosValidation = [
  body('permisos').isArray().withMessage('permisos debe ser un array de permisos'),
  body('permisos.*').isObject().withMessage('Cada permiso debe ser un objeto { permiso_id }'),
  body('permisos.*.permiso_id')
    .isInt({ min: 1 })
    .withMessage('Cada permiso necesita un permiso_id numérico válido'),
];

// Orden de la cadena: sesión -> permiso -> id -> body -> validación -> controller.
router.get('/', requireAuth, requirePermission('VER_PERMISOS'), listar);

router.post(
  '/',
  requireAuth,
  requirePermission('CREAR_PERMISOS'),
  permisoValidation,
  checkValidation,
  crear
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('MODIFICAR_PERMISOS'),
  idNumerico('id'),
  permisoValidation,
  checkValidation,
  actualizar
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('ELIMINAR_PERMISOS'),
  idNumerico('id'),
  eliminar
);

router.post(
  '/:uid/roles/:rid/permisos',
  requireAuth,
  requirePermission('ASIGNAR_PERMISOS'),
  idsParUsuarioRol,
  asignarPermisosValidation,
  checkValidation,
  asignarPermisosUsuarioRol
);

export default router;