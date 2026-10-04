/**
 * =====================================================================
 * routes/roles.routes.js — Roles (/api/roles)
 * =====================================================================
 * Guards por operación:
 *   listar            -> VER_ROLES
 *   crear/editar/borrar -> CREAR_ROLES
 *   permisos del rol   -> VER_ROLES o ASIGNAR_PERMISOS (lectura)
 *                         ASIGNAR_PERMISOS (escritura)
 *   usuarios del rol   -> VER_ROLES o ASIGNAR_ROLES
 * =====================================================================
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
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

router.get('/', requireAuth, requirePermission('VER_ROLES'), listar);
router.post('/', requireAuth, requirePermission('CREAR_ROLES'), crear);
router.patch('/:id', requireAuth, requirePermission('CREAR_ROLES'), actualizar);
router.delete('/:id', requireAuth, requirePermission('CREAR_ROLES'), eliminar);
router.get('/:id/permisos', requireAuth, requirePermission('VER_ROLES', 'ASIGNAR_PERMISOS'), listarPermisos);
router.post('/:id/permisos', requireAuth, requirePermission('ASIGNAR_PERMISOS'), asignarPermisos);
router.delete('/:id/permisos/:pid', requireAuth, requirePermission('ASIGNAR_PERMISOS'), quitarPermiso);
router.get('/:id/usuarios', requireAuth, requirePermission('VER_ROLES', 'ASIGNAR_ROLES'), listarUsuariosDeRol);

export default router;