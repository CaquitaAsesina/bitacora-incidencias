/**
 * =====================================================================
 * routes/permisos.routes.js — Catálogo de permisos (/api/permisos)
 * =====================================================================
 * Guards por operación:
 *   listar            -> VER_PERMISOS
 *   crear/editar/borrar -> CREAR_PERMISOS
 *   asignar a usuario-rol -> ASIGNAR_PERMISOS
 * =====================================================================
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import {
  listar,
  crear,
  actualizar,
  eliminar,
  asignarPermisosUsuarioRol,
} from '../controllers/permisosController.js';

const router = Router();

router.get('/', requireAuth, requirePermission('VER_PERMISOS'), listar);
router.post('/', requireAuth, requirePermission('CREAR_PERMISOS'), crear);
router.patch('/:id', requireAuth, requirePermission('CREAR_PERMISOS'), actualizar);
router.delete('/:id', requireAuth, requirePermission('CREAR_PERMISOS'), eliminar);
router.post('/:uid/roles/:rid/permisos', requireAuth, requirePermission('ASIGNAR_PERMISOS'), asignarPermisosUsuarioRol);

export default router;