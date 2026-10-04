/**
 * =====================================================================
 * routes/auth.routes.js — Autenticación (/api/auth)
 * =====================================================================
 * POST /login    público
 * POST /logout   requireAuth
 * GET  /me       requireAuth
 * =====================================================================
 */
import { Router } from 'express';
import { login, logout, me } from '../controllers/authController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.post('/login', login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);

export default router;
