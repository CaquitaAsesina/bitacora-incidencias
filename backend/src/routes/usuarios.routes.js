import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import {
  listar,
  crear,
  actualizar,
  eliminar,
  asignarRol,
  asignarPermisosPersonalizados,
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
router.post('/:id/roles', requireAuth, requirePermission('ASIGNAR_ROLES'), asignarRol);
router.post('/:uid/roles/:rid/permisos', requireAuth, requirePermission('ASIGNAR_PERMISOS'), asignarPermisosPersonalizados);

export default router;
