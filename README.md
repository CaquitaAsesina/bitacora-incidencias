# Bitácora de Incidencias — Ingeniería Logística (Farmacias Peruanas)

Aplicación web full-stack para registrar y dar seguimiento a incidencias operativas
(centros de distribución y transferencia) con bitácora, dashboard analítico y
administración de usuarios, roles y permisos.

- **Backend**: Node.js + Express (ES Modules) + MySQL.
- **Frontend**: HTML/CSS/JS vanilla sin build, servido por el propio backend.
- **Una sola URL**: el mismo proceso sirve la web y la API bajo `/api/*`.

---

## Índice

1. [Características](#1-características)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Estructura del proyecto](#3-estructura-del-proyecto)
4. [Flujo completo de la aplicación](#4-flujo-completo-de-la-aplicación)
5. [Requisitos previos](#5-requisitos-previos)
6. [Instalación y configuración](#6-instalación-y-configuración)
7. [Ejecución](#7-ejecución)
8. [Primer acceso](#8-primer-acceso)
9. [Seguridad y manejo de secretos](#9-seguridad-y-manejo-de-secretos)
10. [Referencia de la API](#10-referencia-de-la-api)
11. [Modelo de datos](#11-modelo-de-datos)
12. [Rendimiento](#12-rendimiento)
13. [Despliegue en Render](#13-despliegue-en-render)
14. [Convenciones para extender el proyecto](#14-convenciones-para-extender-el-proyecto)

---

## 1. Características

- **Autenticación con sesión persistida en MySQL**: cookie `httpOnly` de 24 h y
  cierre de sesión que destruye la sesión en el servidor.
- **Permisos efectivos por usuario** con dos lógicas independientes:
  - **Lógica A** (`roles.tipo = 'SISTEMA'`): plantilla de permisos del rol en
    `roles_permisos`; aplica a todos los usuarios con ese rol.
  - **Lógica B** (`roles.tipo = 'PERSONALIZADO'`): permisos por par
    (usuario, rol) en `usuarios_roles_permisos` con `concedido = TRUE`.
- **Bitácora de incidencias**:
  - Alta, listado con filtros y paginación, detalle, edición/cierre y borrado.
  - Edición de `fecha` y `hora_inicio`, y corrección de `hora_fin` en incidencias
    ya cerradas, con recálculo automático de `tiempo_solucion`.
  - Autocompletado de centro, sistema, incidencia y responsable con los valores
    ya registrados (se pueden ocultar sugerencias sin tocar la base de datos).
- **Dashboard analítico exclusivo** (permiso `VER_DASHBOARD`): tarjetas KPI y
  5 gráficos con filtro por rango de fechas.
- **Administración**: usuarios (con sus roles), roles (SISTEMA/PERSONALIZADO) y
  catálogo de permisos (crear, renombrar, eliminar y asignar).
- **Tablas consistentes**: columnas "Creacion"/"Modificado", filtros en vivo
  (texto, tipo y rango de fechas por creación o modificación), contador de
  resultados y confirmación visual antes de eliminar.

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Node.js ≥ 18 + Express 4 (ES Modules, sin TypeScript) |
| Base de datos | MySQL 8.0.13+ (en producción, Aiven MySQL; Render no ofrece MySQL) |
| Sesiones | express-session + express-mysql-session (tabla `sessions` en la misma BD) |
| Driver MySQL | mysql2 (pool de conexiones con keep-alive) |
| Seguridad | bcrypt (cost 10), helmet, cors, express-validator |
| Configuración | dotenv (`.env`, no versionado) |
| Frontend | HTML5 + CSS3 + JavaScript vanilla (sin frameworks de UI) |
| Estilos | Bootstrap 5 + CSS propio (paleta rojo/blanco) |
| Gráficos | Chart.js (CDN) |
| Iconos / tipografía | Bootstrap Icons (CDN) / Google Fonts Inter |

## 3. Estructura del proyecto

```
backend/                      # API + servidor de estáticos
  package.json                # dependencias y scripts (start / dev)
  package-lock.json
  .env.example                # plantilla de variables de entorno (sí se versiona)
  .env                        # credenciales locales de verdad (NO se versiona)
  schema.sql                  # esquema + datos iniciales (roles, permisos, admin)
  render.yml                  # Blueprint de despliegue en Render
  src/
    server.js                 # entrada: Express, sesión, estáticos, /api y fallback SPA
    config/db.js              # pool de conexiones MySQL compartido
    middlewares/
      auth.js                 # requireAuth + requirePermission
      errorHandler.js         # manejo central de errores
    routes/                   # endpoints + guards por módulo
    controllers/              # reciben req/res y delegan en services
    services/                 # lógica de negocio y acceso a datos

frontend/                     # UI sin build (la sirve Express como estáticos)
  index.html                  # login
  dashboard.html              # dashboard analítico
  incidencias.html            # bitácora
  usuarios.html  roles.html  permisos.html
  css/styles.css  css/theme.css
  js/
    api.js                    # fetch base, manejo de 401/403 y helpers compartidos
    layout.js                 # sesión (checkAuth), permisos y menú lateral
    ui.js                     # modales, tooltips, confirmaciones, recorte de tablas
    auth.js  dashboard.js  incidencias.js
    usuarios.js  roles.js  permisos.js   # un script por página
  img/                        # logos y favicon

README.md                     # este documento
.gitignore                    # excluye node_modules, .env*, logs y metadatos locales
```

Cada módulo del backend sigue el mismo patrón `routes → controllers → services`.
En el frontend, cada página carga primero `api.js`, `ui.js` y `layout.js`
(compartidos) y después su propio script.

## 4. Flujo completo de la aplicación

### 4.1 Arranque, sesión y navegación

1. El usuario abre la aplicación (`/`). `frontend/js/auth.js` consulta
   `GET /api/auth/me`:
   - **Con sesión activa**: redirige a la primera página permitida según sus
     permisos (`dashboard.html` → `incidencias.html` → `usuarios.html` →
     `roles.html` → `permisos.html`).
   - **Sin sesión**: muestra el formulario de login.
2. `POST /api/auth/login` valida usuario/contraseña con bcrypt, comprueba que el
   usuario esté habilitado y crea la sesión (`bitacora.sid`, cookie `httpOnly`,
   `sameSite=lax`, `secure` cuando `NODE_ENV=production`). La respuesta incluye
   usuario, roles y **permisos efectivos**.
3. En cada página, `checkAuth()` (en `layout.js`) hace **una sola** petición a
   `/api/auth/me` por carga (la promesa se memoiza), guarda los permisos y
   `buildSidebar()` pinta solo los módulos permitidos.
4. Toda petición a la API pasa por `requireAuth` (sesión) y, en los endpoints
   protegidos, por `requirePermission(...)`, que recalcula los permisos efectivos
   en el servidor. Si el usuario no los tiene, la API responde 403 y el frontend
   avisa con un toast; si la sesión expiró (401) redirige al login.
5. `POST /api/auth/logout` destruye la sesión y limpia la cookie.

### 4.2 Resolución de permisos (Lógica A / Lógica B)

- Se implementa en `backend/src/services/permisosService.js`
  (`obtenerPermisosEfectivos`) con **una sola consulta** (UNION) que une:
  - Lógica A: permisos de la plantilla `roles_permisos` de los roles SISTEMA
    del usuario.
  - Lógica B: permisos concedidos en `usuarios_roles_permisos` para los roles
    PERSONALIZADO del usuario.
- La separación entre lógicas se garantiza **en el backend**, nunca en la BD:
  un rol es SISTEMA o PERSONALIZADO (discriminador `roles.tipo`).
- La UI usa los permisos como guía (botones y menú visibles), pero la decisión
  final siempre es del servidor.

### 4.3 Flujo de una incidencia (paso a paso)

1. **Crear** (`CREAR_INCIDENCIA`): el formulario pide tipo de centro, centro,
   sistema, tipo de incidencia, ticket (único), responsable (texto libre) y
   descripción. El backend guarda `usuario_id = sesión` (nunca del body) y deja
   que MySQL rellene `fecha`, `hora_inicio`, `creado_en` y `actualizado_en`;
   `hora_fin` y `tiempo_solucion` quedan en NULL.
2. **Listar/filtrar** (`VER_INCIDENCIAS`): filtros por rango de fechas, tipo de
   centro, estado (abierta/cerrada), `usuario_id`, responsable (texto), centro,
   sistema, tipo de incidencia y búsqueda libre sobre ticket/descripción.
   Paginación de 10 filas; el listado y el total se calculan en paralelo.
3. **Ver detalle** (ícono del ojo): datos generales, tiempos y quién registró la
   incidencia.
4. **Modificar / cerrar** (`MODIFICAR_INCIDENCIA`): el modal permite editar los
   campos, la `fecha` y la `hora_inicio`.
   - Si la incidencia está **abierta**, al guardar se cierra: si se indica
     `hora_fin` se usa esa; si no, la hora actual del servidor. Se calcula
     `tiempo_solucion = hora_fin − hora_inicio` (si el resultado es negativo por
     cruce de medianoche, se suma 24 h).
   - Si ya está **cerrada**, se puede **corregir la `hora_fin`** y el
     `tiempo_solucion` se recalcula.
   - Si la cierra otro usuario, `usuario_id` pasa a ser quien cierra (nuevo
     responsable funcional); el campo libre `responsable` **nunca** se modifica
     al cerrar.
5. **Eliminar** (`ELIMINAR_INCIDENCIA`): pide confirmación visual (`uiConfirmar`).
6. **Autocompletado**: `GET /api/incidencias/valores-sugeridos` alimenta las
   listas de centro/sistema/incidencia/responsable; la "x" de cada sugerencia
   solo la oculta en memoria (si el valor vuelve a registrarse, reaparece).

### 4.4 Dashboard (`VER_DASHBOARD`)

- Módulo exclusivo: `VER_INCIDENCIAS` **no** da acceso al Dashboard.
- Tarjetas KPI: total, abiertas, cerradas, tasa de resolución, tiempo promedio
  de resolución, incidencias de hoy y usuarios registrados.
- Gráficos: top 10 sistemas, tipo de centro, incidencias por centro
  (abiertas/cerradas), tipo de incidencia y línea de tiempos de solución
  (últimos 30 tickets) con badges de promedio/mínimo/máximo.
- Filtro por rango de fechas (`fecha_desde` / `fecha_hasta`) que se aplica a
  todos los datos. Al aplicar, limpiar o cambiar una fecha se recargan KPIs,
  gráficos y la línea **en paralelo**.
- El backend también expone `/por-dia`, `/por-responsable` y `/heatmap`,
  disponibles para gráficos futuros.

### 4.5 Usuarios, roles y permisos

- **Usuarios** (`VER_USUARIOS`; crear/editar/borrar con `CREAR_USUARIO`):
  alta con contraseña (bcrypt, cost 10), edición con contraseña opcional,
  habilitar/deshabilitar, asignar/quitar roles (`ASIGNAR_ROLES`) y permisos
  personalizados por usuario (`ASIGNAR_PERMISOS`, solo con rol PERSONALIZADO).
- **Roles** (`VER_ROLES`; crear/editar/borrar con `CREAR_ROLES`): un rol es
  SISTEMA (plantilla de permisos) o PERSONALIZADO (permisos por usuario). Al
  cambiar el tipo se limpia la tabla de la lógica que deja de aplicar.
- **Permisos** (`VER_PERMISOS`; crear/editar/borrar con `CREAR_PERMISOS`):
  catálogo global y asignación a roles SISTEMA (Lógica A) y a pares
  usuario-rol PERSONALIZADO (Lógica B).

### 4.6 Filtros de las tablas

- Todas las tablas filtran **en vivo** (sin recargar y sin pulsar "Aplicar
  Filtros", aunque el botón sigue disponible):
  - **Incidencias**: los filtros viajan al backend y el listado se recarga.
  - **Usuarios / Roles / Permisos**: filtrado en el cliente sobre los datos ya
    cargados (texto, tipo, estado y rango de fechas).
- El rango de fechas de Usuarios/Roles/Permisos es inclusivo y coincide si la
  **fecha de creación o la de última modificación** caen dentro del rango;
  admite solo "Desde", solo "Hasta" o ambos. "Limpiar" borra todos los filtros.

## 5. Requisitos previos

- Node.js **18 o superior**.
- MySQL **8.0.13 o superior** (local o remoto).
- npm (incluido con Node.js).

## 6. Instalación y configuración

```bash
# 1) Dependencias del backend
cd backend
npm install

# 2) Variables de entorno
cp .env.example .env        # luego edita .env con tus credenciales reales

# 3) Crear la base de datos y los datos iniciales (solo en una BD nueva)
mysql -u <usuario> -p < schema.sql
```

`schema.sql` crea la base `bitacora_incidencias`, las 7 tablas del sistema, el
rol ADMINISTRADOR con todos los permisos y un usuario `admin` inicial.

### Variables de entorno (`backend/.env`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DB_HOST` | Sí | Host de MySQL (por defecto `127.0.0.1`). |
| `DB_PORT` | Sí | Puerto de MySQL (por defecto `3306`). |
| `DB_USER` / `DB_USERNAME` | Sí | Usuario de MySQL (se acepta cualquiera de los dos nombres). |
| `DB_PASSWORD` | Sí | Contraseña de MySQL. |
| `DB_NAME` | Sí | Nombre de la base (por defecto `bitacora_incidencias`). |
| `SESSION_SECRET` | Recomendada | Secreto para firmar la cookie de sesión. Usa una cadena larga y aleatoria; cámbiala en producción. |
| `PORT` | No | Puerto del servidor (por defecto `3000`). |
| `NODE_ENV` | No | `production` activa cookies `secure`. |

> `backend/.env` está en `.gitignore` y **nunca** debe versionarse.
> En el repositorio solo vive `.env.example` con valores de ejemplo.

## 7. Ejecución

```bash
cd backend
npm start        # producción
npm run dev      # desarrollo con recarga automática (nodemon)
```

La aplicación queda disponible en **http://localhost:3000**. El servidor sirve
`frontend/` como estáticos y expone la API bajo `/api/*`; cualquier otra ruta
no-API devuelve el login (fallback SPA) y cualquier `/api/*` desconocida
responde 404 en JSON.

**Verificación rápida** (con el servidor arriba):

```bash
# Login (guarda la cookie de sesión en cookies.txt)
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"usuario":"admin","contrasena":"<tu-contraseña>"}' -c cookies.txt

# KPIs del dashboard con la sesión
curl -s -b cookies.txt http://localhost:3000/api/dashboard/kpis
```

> El backend **no** tiene hot reload con `npm start`: reinicia el proceso tras
> cambiar archivos del servidor. El frontend sí toma los cambios al recargar
> el navegador.

## 8. Primer acceso

1. Ingresa con el usuario `admin` creado por `schema.sql` (su contraseña es la
   del hash insertado en ese archivo; solo el equipo la conoce).
2. **Cambia la contraseña inmediatamente** desde Usuarios → editar `admin`
   (campo contraseña) o crea tu propio usuario administrador y deshabilita el
   `admin` genérico.
3. Nunca escribas contraseñas en claro en el repositorio, el README ni los
   mensajes de commit.

## 9. Seguridad y manejo de secretos

- **`.env` fuera del repositorio**: `.gitignore` excluye `.env`, `.env.*`,
  `node_modules/`, `*.log` y `.freebuff/`. Antes de publicar el repo, verifica
  que `backend/.env` no aparezca en `git ls-files`.
- **Rotación de credenciales**: si una contraseña o host real llegó a
  commitearse, considera la credencial comprometida: cámbiala en el proveedor
  (Aiven → usuario `avnadmin` → *Reset password*) y actualiza `.env` y las
  variables del despliegue.
- **Contraseña del admin**: cámbiala tras el primer acceso (ver sección 8).
- **Sesiones**: cookie `httpOnly`, `sameSite=lax`, `secure` en producción,
  expiración de 24 h y `SESSION_SECRET` propio por entorno.
- **Contraseñas**: siempre hasheadas con bcrypt (cost 10); nunca en texto plano.
- **SQL**: todas las consultas usan parámetros preparados (`?`); no se
  concatenan datos del usuario.
- **Validación**: `express-validator` valida altas y modificaciones (fechas,
  horas, longitudes, enums de tipo de centro, etc.).
- **Cabeceras y CORS**: `helmet` y `cors` configurados en `server.js`; la
  política CSP queda desactivada porque la UI usa CDNs (Bootstrap, Chart.js,
  Google Fonts).
- **Autorización en servidor**: cada endpoint exige sesión y el permiso
  correspondiente; la ocultación de botones en el frontend es solo cosmética.

## 10. Referencia de la API

Todas las respuestas son JSON con `{ ok: true, ... }` o
`{ ok: false, mensaje }`. Los endpoints indicados como protegidos exigen sesión
activa y el permiso listado (`requirePermission`).

### Autenticación

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | público | Valida credenciales y crea la sesión. Devuelve usuario, roles y permisos. |
| POST | `/api/auth/logout` | sesión | Destruye la sesión y limpia la cookie. |
| GET | `/api/auth/me` | sesión | Usuario, roles y permisos efectivos de la sesión. |

### Usuarios (`/api/usuarios`)

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/` | `VER_USUARIOS` | Lista usuarios con su array de roles (sin N+1). |
| POST | `/` | `CREAR_USUARIO` | Crea usuario (contraseña ≥ 6, bcrypt). |
| PATCH | `/:id` | `CREAR_USUARIO` | Actualiza campos y, opcionalmente, la contraseña. |
| DELETE | `/:id` | `CREAR_USUARIO` | Elimina un usuario. |
| GET | `/:id/roles` | `VER_USUARIOS` o `ASIGNAR_ROLES` o `ASIGNAR_PERMISOS` | Roles del usuario. |
| POST | `/:id/roles` | `ASIGNAR_ROLES` | Asigna un rol (idempotente). |
| DELETE | `/:id/roles/:rid` | `ASIGNAR_ROLES` | Quita un rol (sus permisos personalizados caen en cascada). |
| GET | `/:id/permisos-personalizados` | `ASIGNAR_PERMISOS` | Resuelve el rol PERSONALIZADO y sus permisos (Lógica B). |
| POST | `/:id/permisos-personalizados` | `ASIGNAR_PERMISOS` | Reemplaza los permisos personalizados del usuario. |
| DELETE | `/:id/permisos-personalizados/:pid` | `ASIGNAR_PERMISOS` | Quita un permiso personalizado. |
| GET | `/:uid/roles/:rid/permisos` | `ASIGNAR_PERMISOS` | Permisos concedidos del par (usuario, rol). |
| POST | `/:uid/roles/:rid/permisos` | `ASIGNAR_PERMISOS` | Reemplaza los permisos del par (usuario, rol). |
| DELETE | `/:uid/roles/:rid/permisos/:pid` | `ASIGNAR_PERMISOS` | Quita un permiso del par (usuario, rol). |

### Roles (`/api/roles`)

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/` | `VER_ROLES` | Lista roles. |
| POST | `/` | `CREAR_ROLES` | Crea rol (SISTEMA o PERSONALIZADO). |
| PATCH | `/:id` | `CREAR_ROLES` | Edita nombre/tipo; al cambiar de tipo limpia la tabla de la lógica anterior. |
| DELETE | `/:id` | `CREAR_ROLES` | Elimina rol. |
| GET | `/:id/permisos` | `VER_ROLES` o `ASIGNAR_PERMISOS` | Plantilla de permisos del rol (Lógica A). |
| POST | `/:id/permisos` | `ASIGNAR_PERMISOS` | Reemplaza la plantilla (solo roles SISTEMA). |
| DELETE | `/:id/permisos/:pid` | `ASIGNAR_PERMISOS` | Quita un permiso de la plantilla. |
| GET | `/:id/usuarios` | `VER_ROLES` o `ASIGNAR_ROLES` | Usuarios con ese rol. |

### Permisos (`/api/permisos`)

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/` | `VER_PERMISOS` | Catálogo completo de permisos. |
| POST | `/` | `CREAR_PERMISOS` | Crea permiso (nombre único). |
| PATCH | `/:id` | `CREAR_PERMISOS` | Renombra permiso. |
| DELETE | `/:id` | `CREAR_PERMISOS` | Elimina permiso (asignaciones en cascada). |
| POST | `/:uid/roles/:rid/permisos` | `ASIGNAR_PERMISOS` | Asigna permisos al par (usuario, rol) PERSONALIZADO. |

### Incidencias (`/api/incidencias`)

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/` | `VER_INCIDENCIAS` | Listado con filtros y paginación (`page`, `limit`). |
| GET | `/valores-sugeridos` | `VER_INCIDENCIAS` | Valores distintos para autocompletado. |
| GET | `/:id` | `VER_INCIDENCIAS` | Detalle de una incidencia. |
| POST | `/` | `CREAR_INCIDENCIA` | Alta; `usuario_id = sesión`; `fecha`/`hora_inicio` por MySQL. |
| PATCH | `/:id` | `MODIFICAR_INCIDENCIA` | Edita campos, `fecha` y `hora_inicio`; cierra con `{ cerrar: true }`; corrige `hora_fin` si ya está cerrada (recalcula `tiempo_solucion`). |
| PATCH | `/:id/cerrar` | `MODIFICAR_INCIDENCIA` | Cierre directo con la hora del servidor. |
| DELETE | `/:id` | `ELIMINAR_INCIDENCIA` | Elimina incidencia. |

Parámetros de filtro del listado: `fecha_desde`, `fecha_hasta`, `centro`,
`tipo_centro`, `sistema`, `incidencia`, `usuario_id`, `responsable_texto`,
`estado` (`abierta`|`cerrada`), `q` (ticket/descripción), `page`, `limit`.

### Dashboard (`/api/dashboard`, todas exigen `VER_DASHBOARD`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/kpis` | Total, abiertas, cerradas, tasa de resolución, tiempo promedio, hoy y usuarios. |
| GET | `/por-sistema` | Top 10 sistemas con más incidencias. |
| GET | `/por-tipo-centro` | Distribución DISTRIBUCION vs TRANSFERENCIA. |
| GET | `/por-centro` | Incidencias por centro (abiertas/cerradas). |
| GET | `/por-tipo-incidencia` | Incidencias por tipo. |
| GET | `/por-tiempo-solucion` | Serie de tiempos (`limite`, por defecto 30) + promedio/mínimo/máximo. |
| GET | `/por-dia` | Creadas/cerradas por día (disponible para gráficos futuros). |
| GET | `/por-responsable` | Top responsables por `usuario_id` (disponible). |
| GET | `/heatmap` | Matriz día de la semana × hora (disponible). |

Los endpoints del dashboard aceptan `fecha_desde` y `fecha_hasta`
(`YYYY-MM-DD`); si el rango viene invertido se corrige automáticamente.

## 11. Modelo de datos

| Tabla | Rol |
|---|---|
| `usuarios` | Cuentas del sistema (bcrypt, habilitado, `creado_en`/`actualizado_en`). |
| `roles` | Catálogo de roles con discriminador `tipo` (`SISTEMA`/`PERSONALIZADO`). |
| `permisos` | Catálogo de permisos (`VER_*`, `CREAR_*`, `ASIGNAR_*`, …). |
| `usuarios_roles` | Asignación usuario ↔ rol (N:M). |
| `roles_permisos` | Lógica A: plantilla de permisos de un rol SISTEMA. |
| `usuarios_roles_permisos` | Lógica B: permisos por par (usuario, rol) con `concedido`. |
| `incidencias` | Bitácora: datos del ticket, tiempos y `usuario_id` responsable funcional. |
| `sessions` | La crea y mantiene `express-mysql-session` (sesiones de la app). |

Notas:

- `creado_en` / `actualizado_en` existen en usuarios, roles, permisos e
  incidencias (`TIMESTAMP(6)` con `DEFAULT` y `ON UPDATE`).
- `incidencias.fecha` y `hora_inicio` se rellenan en MySQL al insertar
  (`DEFAULT (CURRENT_DATE)` / `DEFAULT (CURRENT_TIME)`).
- Índices de apoyo en incidencias: `idx_incidencias_fecha`,
  `idx_incidencias_centro`, `idx_incidencias_sistema`.
- El campo `responsable` (texto libre) es informativo: **no** participa en la
  reasignación; el responsable funcional es `usuario_id`.
- Los listados y el dashboard que muestran "quién atiende" usan `usuario_id`
  con JOIN a `usuarios` (nombre + apellido).

## 12. Rendimiento

La base de datos está en un MySQL gestionado (Aiven, región Fráncfort), con una
latencia de red de ~200 ms por consulta. Por eso el diseño prioriza **reducir
viajes** y **paralelizar lo independiente**:

- `obtenerPermisosEfectivos` resuelve las Lógicas A y B en **una sola consulta**
  (UNION): afecta a todas las peticiones protegidas, al login y a `/auth/me`.
- Los KPIs del dashboard se obtienen con **una consulta** con agregados
  condicionales (antes eran cinco consultas en serie).
- Listado de incidencias (filas + total), listado de usuarios (usuarios + roles),
  serie y estadísticas de tiempos, login y `/auth/me` ejecutan sus consultas
  **en paralelo** con `Promise.all`.
- El cierre/corrección de incidencias resuelve hora de fin y `tiempo_solucion`
  en una única consulta.
- El pool MySQL usa `enableKeepAlive` para evitar reconexiones (handshake
  TCP/TLS) cuando la base cierra conexiones inactivas.
- El frontend: el dashboard lanza sus 6 peticiones **en paralelo**; incidencias
  (sugerencias + listado) y usuarios (roles + usuarios) también; y cada página
  hace **una sola** llamada a `/api/auth/me` por carga.
- El despliegue en Render se configura en **Fráncfort** (`render.yml`) para
  quedar junto a la base y eliminar la mayor parte de la latencia de red.

## 13. Despliegue en Render

El Blueprint está en `backend/render.yml`. En Render: **New → Blueprint**,
apuntar al repositorio e indicar `backend/render.yml` como *Blueprint file path*.

Configuración del servicio:

- Build: `cd backend && npm install`
- Start: `cd backend && npm start`
- Health check: `/`
- Región: `frankfurt`, plan `free`

La base de datos es un MySQL externo (Render no ofrece MySQL). Las credenciales
se configuran **como variables de entorno del servicio** en el dashboard y
nunca en el YAML ni en el repositorio (`render.yml` las declara con
`sync: false`, así Render las pide): `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `SESSION_SECRET`; `DB_NAME` y `NODE_ENV=production` van fijos.

> El plan free de Render suspende la instancia tras unos minutos de inactividad:
> la primera petición después de eso tarda unos segundos (cold start).

## 14. Convenciones para extender el proyecto

- **Backend**: crea `services/xService.js`, `controllers/xController.js` y
  `routes/x.routes.js`; móntalo en `server.js` bajo `/api/<modulo>` y protege
  cada ruta con `requireAuth` + `requirePermission(...)`. Toda la lógica de
  negocio vive en `services/`.
- **Frontend**: añade la página, su script y los `id` funcionales; reutiliza
  `apiRequest()`, los helpers de `ui.js` y `checkAuth()`/`hasPermission()`
  de `layout.js`. Los helpers compartidos por varias páginas van en `api.js`.
- **Estilos**: usa las clases propias de `theme.css` y Bootstrap 5; evita CSS
  en línea salvo casos puntuales.
- **Comentarios**: cada archivo documenta su responsabilidad y sus reglas
  críticas en la cabecera; mantén ese estilo al tocar código.
- **Fechas mostradas**: usa `formatFechaHora()` (fecha corta local) en las
  tablas; los filtros de rango comparan en fecha local con
  `fechaDentroDeRango()` (`api.js`).
