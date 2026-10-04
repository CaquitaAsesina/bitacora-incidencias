import { Router } from 'express';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import {
  listar,
  crear,
  asignarPermisosUsuarioRol,
} from '../controllers/permisosController.js';

const router = Router();

router.get('/', requireAuth, requirePermission('VER_PERMISOS'), listar);
router.post('/', requireAuth, requirePermission('CREAR_PERMISOS'), crear);
router.post('/:uid/roles/:rid/permisos', requireAuth, requirePermission('ASIGNAR_PERMISOS'), asignarPermisosUsuarioRol);

export default router;
