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
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { opcionesMySQL } from './config/db.js';

import authRoutes from './routes/auth.routes.js';
import usuariosRoutes from './routes/usuarios.routes.js';
import rolesRoutes from './routes/roles.routes.js';
import permisosRoutes from './routes/permisos.routes.js';
import incidenciasRoutes from './routes/incidencias.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const MySQLStore = MySQLStoreFactory(session);

// ---------------------------------------------------------------------
// Sesiones (persistidas en MySQL, cookie httpOnly)
// ---------------------------------------------------------------------
// express-mysql-session copia solo un puñado de claves a mysql2 y descarta
// el resto, así que no se le pasan credenciales: se le entrega un pool propio
// ya montado con la misma configuración que el de la app (MySQL local).
const poolSesiones = mysql.createPool(opcionesMySQL);

const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: 900000, // 15 minutos
    expiration: 86400000, // 24 horas
  },
  poolSesiones
);

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
app.set('trust proxy', 1);
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
app.use(express.static(path.join(__dirname, '../../frontend')));

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
  res.sendFile(path.join(__dirname, '../../frontend/index.html'));
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
