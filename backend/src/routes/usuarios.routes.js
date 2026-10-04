/**
 * =====================================================================
 * routes/usuarios.routes.js — Usuarios (/api/usuarios)
 * =====================================================================
 * Guards por operación:
 *   listar / roles del usuario -> VER_USUARIOS (+ ASIGNAR_ROLES/ASIGNAR_PERMISOS)
 *   crear/editar/borrar        -> CREAR_USUARIO
 *   asignar/quitar rol         -> ASIGNAR_ROLES
 *   permisos personalizados    -> ASIGNAR_PERMISOS
 *
 * Validación de alta con express-validator (usuarioValidation).
 * =====================================================================
 */
import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import {
  listar,
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

const usuarioValidation = [
  body('usuario').notEmpty().trim(),
  body('nombre').notEmpty().trim(),
  body('apellido').notEmpty().trim(),
  body('email').isEmail(),
  body('contrasena').optional().isLength({ min: 6 }),
];

router.get('/', requireAuth, requirePermission('VER_USUARIOS'), listar);
router.post('/', requireAuth, requirePermission('CREAR_USUARIO'), usuarioValidation, crear);
router.patch('/:id', requireAuth, requirePermission('CREAR_USUARIO'), actualizar);
router.delete('/:id', requireAuth, requirePermission('CREAR_USUARIO'), eliminar);
router.get('/:id/roles', requireAuth, requirePermission('VER_USUARIOS', 'ASIGNAR_ROLES', 'ASIGNAR_PERMISOS'), listarRoles);
router.post('/:id/roles', requireAuth, requirePermission('ASIGNAR_ROLES'), asignarRol);
router.delete('/:id/roles/:rid', requireAuth, requirePermission('ASIGNAR_ROLES'), quitarRol);
router.get('/:id/permisos-personalizados', requireAuth, requirePermission('ASIGNAR_PERMISOS'), verRolPersonalizado);
router.post('/:id/permisos-personalizados', requireAuth, requirePermission('ASIGNAR_PERMISOS'), asignarPermisosPorUsuario);
router.delete('/:id/permisos-personalizados/:pid', requireAuth, requirePermission('ASIGNAR_PERMISOS'), quitarPermisoPorUsuario);
router.get('/:uid/roles/:rid/permisos', requireAuth, requirePermission('ASIGNAR_PERMISOS'), listarPermisosDeUsuarioRol);
router.delete('/:uid/roles/:rid/permisos/:pid', requireAuth, requirePermission('ASIGNAR_PERMISOS'), quitarPermisoDeUsuarioRol);
router.post('/:uid/roles/:rid/permisos', requireAuth, requirePermission('ASIGNAR_PERMISOS'), asignarPermisosPersonalizados);

export default router;
