import { Router } from 'express';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import {
  listar,
  crear,
  actualizar,
  eliminar,
  asignarPermisos,
} from '../controllers/rolesController.js';

const router = Router();

router.get('/', requireAuth, requirePermission('VER_ROLES'), listar);
router.post('/', requireAuth, requirePermission('CREAR_ROLES'), crear);
router.patch('/:id', requireAuth, requirePermission('CREAR_ROLES'), actualizar);
router.delete('/:id', requireAuth, requirePermission('CREAR_ROLES'), eliminar);
router.post('/:id/permisos', requireAuth, requirePermission('ASIGNAR_PERMISOS'), asignarPermisos);

export default router;
