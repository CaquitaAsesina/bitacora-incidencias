# Bitácora de Incidencias - Full Stack Web App

Aplicación web full-stack para gestionar una bitácora de incidencias con autenticación, roles y permisos, dashboard analítico y módulo de incidencias.

## Estructura del Proyecto

```
backend/
  server.js                 # entrada: Express, sesión, estáticos y /api
  schema.sql                # esquema + datos iniciales (roles, permisos, admin)
  src/
    config/db.js            # pool de conexiones MySQL
    middlewares/            # auth (requireAuth/requirePermission) y errorHandler
    routes/                 # endpoints y guards por módulo
    controllers/            # reciben req/res y delegan en services
    services/               # lógica de negocio y acceso a datos
    public/                 # frontend sin build
      *.html                # una página por módulo (login, dashboard, ...)
      js/                   # api.js + layout.js compartidos y un script por página
      css/styles.css        # estilos globales
```

Cada módulo del backend sigue el mismo patrón `routes -> controllers -> services`.
En el frontend, cada página carga `api.js` (base) y `layout.js` (menú/permisos)
antes de su propio script.

Para agregar un módulo nuevo: crea `services/xService.js`, `controllers/xController.js`
y `routes/x.routes.js`, móntalo en `server.js`, y añade su página + script en `public/`.

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express (ES Modules, sin TypeScript) |
| Base de datos | MySQL 8.0.13+ |
| Sesiones | express-session + express-mysql-session |
| Driver MySQL | mysql2 (pool de conexiones) |
| Seguridad | bcrypt, helmet, cors, express-validator |
| Variables de entorno | dotenv |
| Frontend | HTML5 + CSS3 + JavaScript vanilla (sin frameworks JS de UI) |
| Estilos | Bootstrap 5 + CSS personalizado (paleta rojo/blanco) |
| Gráficos | Chart.js (CDN) |
| Iconos | Bootstrap Icons (CDN) |
| Tipografía | Google Fonts (Inter) |

## Requisitos Previos

- Node.js 18+ 
- MySQL 8.0.13+
- npm o yarn

## Instalación

1. Clonar el repositorio
2. Instalar dependencias:
```bash
cd backend
npm install
```

3. Configurar variables de entorno:
```bash
cp .env.example .env
```
Editar `.env` con sus credenciales de MySQL.

4. Crear la base de datos:
```bash
mysql -u root -p < schema.sql
```

5. Ejecutar la aplicación:
```bash
npm run dev
# o
npm start
```

6. Acceder a la aplicación en: http://localhost:3000

## Credenciales por Defecto

- Usuario: `admin`
- Contraseña: `admin123`

## Observación de Diseño - Campo "responsable"

El responsable funcional de una incidencia se modela en la columna `usuario_id` (identificador de usuario). 

- Al crear una incidencia: `usuario_id = sesion.id` (el creador es el responsable actual). 
- Al cerrar una incidencia por un usuario distinto al `usuario_id` actual: `usuario_id` se sobreescribe con el id del usuario que cierra (el que cierra pasa a ser el nuevo responsable funcional).
- Si cierra el mismo usuario: `usuario_id` no cambia.

La columna `responsable` (VARCHAR(60)) es un campo de texto libre descriptivo capturado en el formulario. **No almacena IDs de usuario, no participa en la lógica de reasignación y NUNCA se modifica al cerrar la incidencia**.

Los listados y el dashboard que muestran "quién atiende" deben usar `usuario_id` (con JOIN a `usuarios` para obtener nombre + apellido). El campo `responsable` solo se muestra como información adicional.

## Observación sobre el Módulo Dashboard

El Dashboard es un módulo exclusivo: **solo es visible y accesible para usuarios que tienen el permiso `VER_DASHBOARD`** (`VER_INCIDENCIAS` no da acceso al Dashboard).

`VER_DASHBOARD` se incluye en el catálogo inicial de permisos en `schema.sql`. Esta regla se aplica en tres capas:

1. **Backend**: todas las rutas de `/api/dashboard/*` exigen `requirePermission('VER_DASHBOARD')`.
2. **Menú lateral** (`layout.js`): el enlace "Dashboard" solo se muestra con `VER_DASHBOARD`.
3. **Acceso directo** (`dashboard.html`): al entrar sin `VER_DASHBOARD`, el usuario es redirigido a la primera página que sí puede ver. El login también aterriza en la primera página permitida (no siempre en el Dashboard).

## Arquitectura de Permisos

El sistema implementa dos lógicas separadas:

### Lógica A (roles tipo = 'SISTEMA')
Los permisos se obtienen desde la tabla `roles_permisos` (plantilla). Aplica a todos los usuarios con ese rol.

### Lógica B (roles tipo = 'PERSONALIZADO')
Los permisos se obtienen desde la tabla `usuarios_roles_permisos` (solo para el par (usuario_id, rol_id) con `concedido = TRUE`). 

La separación entre ambas lógicas se garantiza en `permisosService.js` (backend), nunca en BD.

## Cálculo de tiempo_solucion

Al cerrar una incidencia:
1. Se obtiene `hora_inicio` de la incidencia y `hora_fin = CURTIME()` del servidor
2. Se calcula `TIMEDIFF(hora_fin, hora_inicio)` 
3. Si el resultado es negativo (cruce de medianoche), se suma 24 horas con `ADDTIME`
4. Se almacena en formato `HH:MM:SS`

## Top Responsables

El gráfico "Top responsables actuales que más incidencias han atendido" en el dashboard agrupa por `i.usuario_id` (no por el campo `responsable`), haciendo JOIN con `usuarios` para mostrar `CONCAT(nombre, ' ', apellido)`. Esto refleja correctamente quién es el responsable funcional actual.

## Seguridad

- Sesiones almacenadas en MySQL con `httpOnly: true`, `sameSite: 'lax'`, `secure` según entorno
- Contraseñas hasheadas con bcrypt (cost 10)
- Todas las consultas usan parámetros preparados (`?`)
- Endpoints protegidos con `requireAuth` + `requirePermission`
- Validación de datos con `express-validator`
- Headers de seguridad con `helmet`
- CORS configurado apropiadamente
