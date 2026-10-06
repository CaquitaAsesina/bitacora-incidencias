/**
 * =====================================================================
 * routes/roles.routes.js — Roles (/api/roles)
 * =====================================================================
 * Guards por operación (nombres exactos del catálogo en schema.sql):
 *   listar             -> VER_ROLES
 *   crear              -> CREAR_ROLES
 *   editar             -> MODIFICAR_ROLES
 *   borrar             -> ELIMINAR_ROLES
 *   permisos del rol   -> VER_ROLES o ASIGNAR_PERMISOS (lectura)
 *                         ASIGNAR_PERMISOS (escritura)
 *   usuarios del rol   -> VER_ROLES o ASIGNAR_ROLES
 *
 * Antes editar y borrar exigían CREAR_ROLES; con el catálogo nuevo cada
 * operación tiene su propio permiso.
 *
 * La auditoría (`creado_por` / `actualizado_por`) la firma la sesión: el body
 * no puede mandarla, y por eso se rechaza explícitamente en crear/actualizar.
 * =====================================================================
 */
import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import { checkValidation, idNumerico } from '../middlewares/validacion.js';
import {
  listar,
  crear,
  actualizar,
  eliminar,
  listarPermisos,
  asignarPermisos,
  quitarPermiso,
  listarUsuariosDeRol,
} from '../controllers/rolesController.js';

const router = Router();

const TIPOS_ROL = ['SISTEMA', 'PERSONALIZADO'];

// La auditoría la firma la sesión, no el cliente.
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

// Alta: nombre obligatorio. `tipo` es opcional porque el servicio usa SISTEMA.
const rolCrearValidation = [
  body('nombre').notEmpty().trim().isLength({ max: 50 }),
  body('tipo').optional().isIn(TIPOS_ROL).withMessage('tipo debe ser SISTEMA o PERSONALIZADO'),
  ...sinAuditoria,
];

// Edición: todo opcional; actualizarRol solo toca los campos que llegan, así que
// un PATCH de { tipo } no debe exigir el nombre.
const rolActualizarValidation = [
  body('nombre').optional({ values: 'falsy' }).notEmpty().trim().isLength({ max: 50 }),
  body('tipo').optional().isIn(TIPOS_ROL).withMessage('tipo debe ser SISTEMA o PERSONALIZADO'),
  ...sinAuditoria,
];

// Asignar permisos: array de ids de permisos (Lógica A del rol).
const asignarPermisosValidation = [
  body('permisos').isArray().withMessage('permisos debe ser un array de ids de permiso'),
  body('permisos.*').isInt({ min: 1 }).withMessage('Cada permiso debe ser un id numérico'),
];

// Orden de la cadena: sesión -> permiso -> id -> body -> validación -> controller.
// ASIGNAR_ROLES tambien necesita el catalogo: sin el no hay de donde elegir el
// rol que se va a asignar. Mismo criterio que '/:id/usuarios' más abajo.
router.get('/', requireAuth, requirePermission('VER_ROLES', 'ASIGNAR_ROLES'), listar);

router.post(
  '/',
  requireAuth,
  requirePermission('CREAR_ROLES'),
  rolCrearValidation,
  checkValidation,
  crear
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('MODIFICAR_ROLES'),
  idNumerico('id'),
  rolActualizarValidation,
  checkValidation,
  actualizar
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('ELIMINAR_ROLES'),
  idNumerico('id'),
  eliminar
);

router.get(
  '/:id/permisos',
  requireAuth,
  requirePermission('VER_ROLES', 'ASIGNAR_PERMISOS'),
  idNumerico('id'),
  listarPermisos
);

router.post(
  '/:id/permisos',
  requireAuth,
  requirePermission('ASIGNAR_PERMISOS'),
  idNumerico('id'),
  asignarPermisosValidation,
  checkValidation,
  asignarPermisos
);

router.delete(
  '/:id/permisos/:pid',
  requireAuth,
  requirePermission('ASIGNAR_PERMISOS'),
  idNumerico('id'),
  idNumerico('pid'),
  quitarPermiso
);

router.get(
  '/:id/usuarios',
  requireAuth,
  requirePermission('VER_ROLES', 'ASIGNAR_ROLES'),
  idNumerico('id'),
  listarUsuariosDeRol
);

export default router;