/**
 * =====================================================================
 * routes/usuarios.routes.js — Usuarios (/api/usuarios)
 * =====================================================================
 * Guards por operación (nombres exactos del catálogo en schema.sql):
 *   listar / detalle / roles -> VER_USUARIOS (+ ASIGNAR_ROLES/ASIGNAR_PERMISOS)
 *   crear                    -> CREAR_USUARIOS
 *   editar                   -> MODIFICAR_USUARIOS
 *   borrar                   -> ELIMINAR_USUARIOS
 *   asignar/quitar rol       -> ASIGNAR_ROLES
 *   permisos personalizados  -> ASIGNAR_PERMISOS
 *
 * Antes elPATCH y el DELETE exigían CREAR_USUARIO; con el catálogo nuevo cada
 * operación tiene su permiso, así que una cuenta de soporte puede editar sin
 * poder dar de alta ni borrar.
 * =====================================================================
 */
import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import {
  checkValidation,
  idNumerico,
  idsParUsuarioRol,
  idsPersonalizados,
} from '../middlewares/validacion.js';
import {
  listar,
  listarParaAsignar,
  obtenerPorId,
  crear,
  actualizar,
  eliminar,
  listarRoles,
  asignarRol,
  quitarRol,
  asignarPermisosPersonalizados,
  listarPermisosDeUsuarioRol,
  quitarPermisoDeUsuarioRol,
  verRolPersonalizado,
  asignarPermisosPorUsuario,
  quitarPermisoPorUsuario,
} from '../controllers/usuariosController.js';

const router = Router();

/** POST /:id/roles — cuerpo { rol_id }. */
const asignarRolValidation = [
  body('rol_id').isInt({ min: 1 }).withMessage('rol_id debe ser un id de rol válido'),
];

/**
 * Permisos personalizados (Lógica B) — cuerpo `{ permisos: [{ permiso_id, concedido }] }`.
 *
 * El objeto, no un id suelto: `concedido: false` deniega explícitamente un
 * permiso que la Lógica A concede, y esa fila tiene que poder guardarse aunque
 * el checkbox esté desmarcado. Un `number[]` perdería esa información y el
 * servicio (`normalizarPermisos`) además la descartaría.
 */
const permisosValidation = [
  body('permisos').isArray().withMessage('permisos debe ser un array de permisos'),
  body('permisos.*').isObject().withMessage('Cada permiso debe ser un objeto { permiso_id, concedido }'),
  body('permisos.*.permiso_id')
    .isInt({ min: 1 })
    .withMessage('Cada permiso necesita un permiso_id numérico válido'),
  body('permisos.*.concedido')
    .optional()
    .isBoolean()
    .withMessage('concedido debe ser true o false'),
];

// La auditoría la firma la sesión, no el cliente.
const sinAuditoria = [
  body('creado_por').not().exists().withMessage('El campo creado_por lo define el servidor'),
  body('actualizado_por')
    .not()
    .exists()
    .withMessage('El campo actualizado_por lo define el servidor'),
];

// Alta: todo obligatorio. La contraseña solo se exige al crear, no al editar.
const usuarioCrearValidation = [
  body('usuario').notEmpty().trim(),
  body('nombre').notEmpty().trim(),
  body('apellido').notEmpty().trim(),
  body('email').isEmail(),
  body('contrasena').notEmpty().isLength({ min: 6 }),
  body('telefono').optional({ values: 'falsy' }).trim(),
  body('habilitado').optional().isBoolean(),
  ...sinAuditoria,
];

// Edición: todo opcional, porque actualizarUsuario solo toca lo que llega.
const usuarioActualizarValidation = [
  body('usuario').optional({ values: 'falsy' }).notEmpty().trim(),
  body('nombre').optional({ values: 'falsy' }).notEmpty().trim(),
  body('apellido').optional({ values: 'falsy' }).notEmpty().trim(),
  body('email').optional({ values: 'falsy' }).isEmail(),
  body('contrasena').optional({ values: 'falsy' }).isLength({ min: 6 }),
  body('telefono').optional().trim(),
  body('habilitado').optional().isBoolean(),
  ...sinAuditoria,
];

// Orden de la cadena: sesión -> permiso -> id -> body -> validación -> controller.
// checkValidation DEBE ir después de los validadores del body; idNumerico
// valida que el :id sea un entero antes de tocar la base de datos.
router.get('/', requireAuth, requirePermission('VER_USUARIOS'), listar);

// Mínimo privilegio: el desplegable de "asignar rol a usuario" solo necesita
// identidad. Se declara ANTES de '/:id' para que Express no lo capture como id.
router.get(
  '/lista',
  requireAuth,
  requirePermission('ASIGNAR_ROLES'),
  listarParaAsignar
);

// Detalle con el mismo contrato que el listado (roles, conteos y auditoría).
// Va antes que '/:id/roles' por claridad, aunque Express ya distingue los
// métodos y no habría ambigüedad real.
router.get(
  '/:id',
  requireAuth,
  requirePermission('VER_USUARIOS'),
  idNumerico('id'),
  obtenerPorId
);

router.post(
  '/',
  requireAuth,
  requirePermission('CREAR_USUARIOS'),
  usuarioCrearValidation,
  checkValidation,
  crear
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('MODIFICAR_USUARIOS'),
  idNumerico('id'),
  usuarioActualizarValidation,
  checkValidation,
  actualizar
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('ELIMINAR_USUARIOS'),
  idNumerico('id'),
  eliminar
);

router.get(
  '/:id/roles',
  requireAuth,
  requirePermission('VER_USUARIOS', 'ASIGNAR_ROLES', 'ASIGNAR_PERMISOS'),
  idNumerico('id'),
  listarRoles
);

router.post(
  '/:id/roles',
  requireAuth,
  requirePermission('ASIGNAR_ROLES'),
  idNumerico('id'),
  asignarRolValidation,
  checkValidation,
  asignarRol
);

router.delete(
  '/:id/roles/:rid',
  requireAuth,
  requirePermission('ASIGNAR_ROLES'),
  idNumerico('id'),
  idNumerico('rid'),
  quitarRol
);

// Permisos personalizados del rol PERSONALIZADO del usuario (Lógica B).
router.get(
  '/:id/permisos-personalizados',
  requireAuth,
  requirePermission('ASIGNAR_PERMISOS'),
  idNumerico('id'),
  verRolPersonalizado
);

router.post(
  '/:id/permisos-personalizados',
  requireAuth,
  requirePermission('ASIGNAR_PERMISOS'),
  idNumerico('id'),
  permisosValidation,
  checkValidation,
  asignarPermisosPorUsuario
);

router.delete(
  '/:id/permisos-personalizados/:pid',
  requireAuth,
  requirePermission('ASIGNAR_PERMISOS'),
  idNumerico('id'),
  idNumerico('pid'),
  quitarPermisoPorUsuario
);

// Permisos personalizados de un par usuario+rol concreto (Lógica A).
router.get(
  '/:uid/roles/:rid/permisos',
  requireAuth,
  requirePermission('ASIGNAR_PERMISOS'),
  idsParUsuarioRol,
  listarPermisosDeUsuarioRol
);

router.delete(
  '/:uid/roles/:rid/permisos/:pid',
  requireAuth,
  requirePermission('ASIGNAR_PERMISOS'),
  idsPersonalizados,
  quitarPermisoDeUsuarioRol
);

router.post(
  '/:uid/roles/:rid/permisos',
  requireAuth,
  requirePermission('ASIGNAR_PERMISOS'),
  idsParUsuarioRol,
  permisosValidation,
  checkValidation,
  asignarPermisosPersonalizados
);

export default router;