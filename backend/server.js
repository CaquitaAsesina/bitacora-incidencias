/**
 * =====================================================================
 * server.js — Punto de entrada de la API + estáticos
 * =====================================================================
 * Monta Express, la sesión en MySQL, los archivos estáticos del frontend y
 * todas las rutas bajo /api. Delegas el error final en errorHandler.
 *
 * Orden de capas:
 *   1. Seguridad (helmet, cors)  2. Parsers  3. Sesión
 *   4. Estáticos del frontend    5. Rutas /api/*   6. 404 /api y fallback SPA
 *   7. errorHandler
 *
 * Para agregar un módulo nuevo: crea su archivo en src/routes, impórtalo aquí
 * y móntalo con app.use('/api/<modulo>', ...). Añádelo en "Rutas API".
 * =====================================================================
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './src/routes/auth.routes.js';
import usuariosRoutes from './src/routes/usuarios.routes.js';
import rolesRoutes from './src/routes/roles.routes.js';
import permisosRoutes from './src/routes/permisos.routes.js';
import incidenciasRoutes from './src/routes/incidencias.routes.js';
import dashboardRoutes from './src/routes/dashboard.routes.js';
import { errorHandler } from './src/middlewares/errorHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const MySQLStore = MySQLStoreFactory(session);

// ---------------------------------------------------------------------
// Sesiones (persistidas en MySQL, cookie httpOnly)
// ---------------------------------------------------------------------
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bitacora_incidencias',
  clearExpired: true,
  checkExpirationInterval: 900000, // 15 minutos
  expiration: 86400000, // 24 horas
});

// ---------------------------------------------------------------------
// Seguridad y parsers
// ---------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    key: 'bitacora.sid',
    secret: process.env.SESSION_SECRET || 'default_secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// ---------------------------------------------------------------------
// Frontend estático (HTML/CSS/JS sin build)
// ---------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'src/public')));

// ---------------------------------------------------------------------
// Rutas API
// ---------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/permisos', permisosRoutes);
app.use('/api/incidencias', incidenciasRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Cualquier ruta /api/* desconocida devuelve 404 en JSON (no el HTML del login)
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, mensaje: 'Endpoint no encontrado' });
});

// Fallback SPA: cualquier ruta no-API devuelve el login
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/public/index.html'));
});

// Manejo central de errores (siempre al final)
app.use(errorHandler);

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
