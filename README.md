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
  8 gráficos, con un juego de filtros globales (fechas, centro, sistema, tipo
  de incidencia, responsable, estado y autor de registro).
- **Administración**: usuarios (con sus roles, sus conteos de incidencias y su
  auditoría), roles (SISTEMA/PERSONALIZADO con conteos) y catálogo de permisos
  (crear, renombrar, eliminar y asignar), los tres con quién los creó y quién
  los modificó por última vez.
- **Auditoría en todas las tablas**: `incidencias` la firma `creado_por` /
  `actualizado_por` (autor y última edición); igual `usuarios`, `roles` y
  `permisos`. El autor **siempre** sale de la sesión, nunca del cuerpo de la
  petición.
- **Tablas consistentes**: contador de resultados, filtros en vivo, ordenación
  con lista blanca y confirmación visual antes de eliminar.

## 2. Stack tecnológico

| Capa                | Tecnología                                                                |
| ------------------- | ------------------------------------------------------------------------- |
| Backend             | Node.js ≥ 18 + Express 4 (ES Modules, sin TypeScript)                     |
| Base de datos       | MySQL 8.0.13+ (en producción, Aiven MySQL; Render no ofrece MySQL)        |
| Sesiones            | express-session + express-mysql-session (tabla `sessions` en la misma BD) |
| Driver MySQL        | mysql2 (pool de conexiones con keep-alive)                                |
| Seguridad           | bcrypt (cost 10), helmet, cors, express-validator                         |
| Configuración       | dotenv (`.env`, no versionado)                                            |
| Frontend            | HTML5 + CSS3 + JavaScript vanilla (sin frameworks de UI)                  |
| Estilos             | Bootstrap 5 + CSS propio (paleta rojo/blanco)                             |
| Gráficos            | Chart.js (CDN)                                                            |
| Iconos / tipografía | Bootstrap Icons (CDN) / Google Fonts Inter                                |

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

1. **Crear** (`CREAR_INCIDENCIAS`): el formulario pide centro, sistema, tipo de
   incidencia, ticket (único), responsable (texto libre) y descripción. El
   backend guarda `creado_por = sesión` (nunca del body) y deja que MySQL
   rellene `fecha`, `hora_inicio`, `creado_en` y `actualizado_en`; `hora_fin` y
   `tiempo_solucion` quedan en NULL.
2. **Listar/filtrar** (`VER_INCIDENCIAS`): filtros por rango de fechas, centro,
   sistema, incidencia, responsable, estado (abierta/cerrada), autor de registro
   (`creado_por`) y búsqueda libre (`q` sobre ticket/descripción). Los filtros
   de dimensión son **de igualdad exacta** para que el planner use los índices
   compuestos; solo `q` usa `LIKE '%texto%'`. Paginación de 10 filas; el
   listado, el total y el resumen por estado se calculan en paralelo.
3. **Ver detalle** (ícono del ojo): datos generales, tiempos y quién registró la
   incidencia.
4. **Modificar / cerrar** (`MODIFICAR_INCIDENCIAS`): el modal permite editar los
   campos, la `fecha` y la `hora_inicio`.
   - Si la incidencia está **abierta**, al guardar se cierra: si se indica
     `hora_fin` se usa esa; si no, la hora actual del servidor. Se calcula
     `tiempo_solucion = hora_fin − hora_inicio` (si el resultado es negativo por
     cruce de medianoche, se suma 24 h).
   - Si ya está **cerrada**, se puede **corregir la `hora_fin`** y el
     `tiempo_solucion` se recalcula.
   - Quien cierra queda como `actualizado_por` (la auditoría de la última
     edición); el campo libre `responsable` **nunca** se modifica al cerrar.
5. **Eliminar** (`ELIMINAR_INCIDENCIAS`): pide confirmación visual (`uiConfirmar`).
6. **Autocompletado**: `GET /api/incidencias/valores-sugeridos` alimenta las
   listas de centro/sistema/incidencia/responsable; la "x" de cada sugerencia
   solo la oculta en memoria (si el valor vuelve a registrarse, reaparece).

### 4.4 Dashboard (`VER_DASHBOARD`)

- Módulo exclusivo: `VER_INCIDENCIAS` **no** da acceso al Dashboard.
- Tarjetas KPI: total, abiertas, cerradas, tasa de resolución, tiempo promedio
  y máximo de resolución, incidencias de hoy y centros distintos (los conteos
  de sistemas, tipos y autores salen en el tooltip).
- Gráficos: serie diaria creadas/cerradas, top 10 sistemas, estado
  (abiertas/cerradas), incidencias por centro (apiladas abiertas/cerradas),
  top tipos de incidencia, top responsables de negocio, top autores de registro
  y línea de tiempos de solución (últimos 30 tickets) con badges de
  promedio/mínimo/máximo.
- Un único juego de filtros globales (fechas, centro, sistema, tipo de
  incidencia, responsable, estado y autor) que se aplica a KPIs y gráficos. Al
  cambiar cualquiera se recarga todo **en paralelo**; `cargarTodo()` evita
  solapamientos para que Chart.js no intente repintar un canvas en uso.
- Los desplegables de filtro se llenan desde `/dashboard/metadatos`, que
  devuelve los valores que existen de verdad en la base más el rango de fechas
  con datos: el frontend no duplica catálogos.
- **Dos rankings distintos que no se mezclan**: `/por-responsable` es el
  responsable de negocio (texto libre de la incidencia) y `/por-autor` es el
  usuario del sistema que registró la fila (`creado_por`).

### 4.5 Usuarios, roles y permisos

Cada operación tiene su propio permiso (antes el PATCH y el DELETE exigían el
de crear, lo que dejaba cuentas sin capacidad real de edición ni borrado).

- **Usuarios**: listar y ver detalle (`VER_USUARIOS`), crear
  (`CREAR_USUARIOS`), editar (`MODIFICAR_USUARIOS`), borrar
  (`ELIMINAR_USUARIOS`). Alta con contraseña (bcrypt, cost 10), edición con
  contraseña opcional, habilitar/deshabilitar, asignar/quitar roles
  (`ASIGNAR_ROLES`) y permisos personalizados (`ASIGNAR_PERMISOS`, solo con rol
  PERSONALIZADO). El listado trae roles, conteos de incidencias creadas y
  modificadas, y la auditoría. **No se puede borrar** un usuario con
  incidencias asociadas (FK `ON DELETE RESTRICT`): el servicio lo impide con un
  409 que sugiere deshabilitarlo en su lugar.
- **Roles**: `VER_ROLES`, `CREAR_ROLES`, `MODIFICAR_ROLES`, `ELIMINAR_ROLES`. Un
  rol es SISTEMA (plantilla de permisos) o PERSONALIZADO (permisos por
  usuario). Al cambiar de tipo se limpia la tabla de la lógica que deja de
  aplicar, y ese borrado va **en la misma transacción** que el `UPDATE`: si la
  actualización fallara, el rol no habría perdido sus permisos sin haber
  cambiado de tipo. Cada fila trae el número de usuarios, el de permisos de la
  plantilla y su auditoría.
  - `DELETE /api/roles/:id` **no comprueba quién lo tenía**: la FK
    `usuarios_roles.rol_id` es `ON DELETE CASCADE`, así que el rol y sus
    permisos desaparecen de golpe para todos sus usuarios. La UI avisa con el
    número de usuarios afectados y pide confirmación, pero quien llame a la API
    directamente se lleva el mismo borrado silencioso. Borrar el último rol que
    tiene un administrador lo deja sin ningún permiso, y la única salida es
    restaurar el rol por base de datos.
- **Permisos**: `VER_PERMISOS`, `CREAR_PERMISOS`, `MODIFICAR_PERMISOS`,
  `ELIMINAR_PERMISOS`. Catálogo global y asignación a roles SISTEMA (Lógica A)
  y a pares usuario-rol PERSONALIZADO (Lógica B). Cada fila muestra cuántos
  roles lo usan y cuántos usuarios lo tienen concedido o denegado.

### 4.6 Filtros de las tablas

- Todas las tablas filtran **en vivo** (sin pulsar "Aplicar Filtros", aunque el
  botón sigue disponible):
  - **Incidencias y Usuarios**: los filtros y la ordenación viajan al backend y
    el listado se recarga. En Usuarios, los cuatro campos de texto se unen en un
    parámetro `q` y el orden sale de una lista blanca del servidor
    (`alfabetico`, `usuario`, `reciente`, `antiguo`, `modificado`, `id`, …).
  - **Roles**: el filtro de `tipo` va al servidor (`idx_roles_tipo`); nombre y
    fechas se resuelven en el navegador, que es un catálogo pequeño.
  - **Permisos**: filtrado en el cliente sobre el catálogo ya cargado.
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

| Variable                  | Obligatoria | Descripción                                                                                        |
| ------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `DB_HOST`                 | Sí          | Host de MySQL (por defecto `127.0.0.1`).                                                           |
| `DB_PORT`                 | Sí          | Puerto de MySQL (por defecto `3306`).                                                              |
| `DB_USER` / `DB_USERNAME` | Sí          | Usuario de MySQL (se acepta cualquiera de los dos nombres).                                        |
| `DB_PASSWORD`             | Sí          | Contraseña de MySQL.                                                                               |
| `DB_NAME`                 | Sí          | Nombre de la base (por defecto `bitacora_incidencias`).                                            |
| `SESSION_SECRET`          | Recomendada | Secreto para firmar la cookie de sesión. Usa una cadena larga y aleatoria; cámbiala en producción. |
| `PORT`                    | No          | Puerto del servidor (por defecto `3000`).                                                          |
| `NODE_ENV`                | No          | `production` activa cookies `secure`.                                                              |

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
  (Aiven → usuario `avnadmin` → _Reset password_) y actualiza `.env` y las
  variables del despliegue.
- **Contraseña del admin**: cámbiala tras el primer acceso (ver sección 8).
- **Sesiones**: cookie `httpOnly`, `sameSite=lax`, `secure` en producción,
  expiración de 24 h y `SESSION_SECRET` propio por entorno.
- **Contraseñas**: siempre hasheadas con bcrypt (cost 10); nunca en texto plano.
- **SQL**: todas las consultas usan parámetros preparados (`?`); no se
  concatenan datos del usuario.
- **Validación**: `express-validator` valida cuerpo, query y parámetros de ruta,
  y `checkValidation` (`middlewares/validacion.js`) corta la petición con
  `400 { ok: false, mensaje, errors }` antes de tocar la base de datos. Es
  **fail-closed**: un id mal formado no llega al servicio. Cubre fechas, horas,
  longitudes, enums (`tipo`, `estado`), arrays de ids y rangos de paginación.
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

| Método | Ruta               | Permiso | Descripción                                                               |
| ------ | ------------------ | ------- | ------------------------------------------------------------------------- |
| POST   | `/api/auth/login`  | público | Valida credenciales y crea la sesión. Devuelve usuario, roles y permisos. |
| POST   | `/api/auth/logout` | sesión  | Destruye la sesión y limpia la cookie.                                    |
| GET    | `/api/auth/me`     | sesión  | Usuario, roles y permisos efectivos de la sesión.                         |

### Usuarios (`/api/usuarios`)

| Método | Ruta                                | Permiso                                               | Descripción                                                                                                |
| ------ | ----------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/`                                 | `VER_USUARIOS`                                        | Lista usuarios con roles, conteos de incidencias y auditoría. Acepta `q`, `rol`, `estado`, `orden`, `asc`. |
| GET    | `/:id`                              | `VER_USUARIOS`                                        | Detalle del usuario con roles, conteos y auditoría.                                                        |
| POST   | `/`                                 | `CREAR_USUARIOS`                                      | Crea usuario (contraseña ≥ 6, bcrypt).                                                                     |
| PATCH  | `/:id`                              | `MODIFICAR_USUARIOS`                                  | Actualiza campos y, opcionalmente, la contraseña.                                                          |
| DELETE | `/:id`                              | `ELIMINAR_USUARIOS`                                   | Elimina un usuario.                                                                                        |
| GET    | `/:id/roles`                        | `VER_USUARIOS` o `ASIGNAR_ROLES` o `ASIGNAR_PERMISOS` | Roles del usuario.                                                                                         |
| POST   | `/:id/roles`                        | `ASIGNAR_ROLES`                                       | Asigna un rol (idempotente).                                                                               |
| DELETE | `/:id/roles/:rid`                   | `ASIGNAR_ROLES`                                       | Quita un rol (sus permisos personalizados caen en cascada).                                                |
| GET    | `/:id/permisos-personalizados`      | `ASIGNAR_PERMISOS`                                    | Resuelve el rol PERSONALIZADO y sus permisos (Lógica B).                                                   |
| POST   | `/:id/permisos-personalizados`      | `ASIGNAR_PERMISOS`                                    | Reemplaza los permisos personalizados del usuario.                                                         |
| DELETE | `/:id/permisos-personalizados/:pid` | `ASIGNAR_PERMISOS`                                    | Quita un permiso personalizado.                                                                            |
| GET    | `/:uid/roles/:rid/permisos`         | `ASIGNAR_PERMISOS`                                    | Permisos concedidos del par (usuario, rol).                                                                |
| POST   | `/:uid/roles/:rid/permisos`         | `ASIGNAR_PERMISOS`                                    | Reemplaza los permisos del par (usuario, rol).                                                             |
| DELETE | `/:uid/roles/:rid/permisos/:pid`    | `ASIGNAR_PERMISOS`                                    | Quita un permiso del par (usuario, rol).                                                                   |

### Roles (`/api/roles`)

| Método | Ruta                 | Permiso                          | Descripción                                                                                                                      |
| ------ | -------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`                  | `VER_ROLES`                      | Lista roles.                                                                                                                     |
| POST   | `/`                  | `CREAR_ROLES`                    | Crea rol (SISTEMA o PERSONALIZADO).                                                                                              |
| PATCH  | `/:id`               | `MODIFICAR_ROLES`                | Edita nombre/tipo (solo los campos enviados); al cambiar de tipo limpia la tabla de la lógica anterior, en la misma transacción. |
| DELETE | `/:id`               | `ELIMINAR_ROLES`                 | Elimina rol.                                                                                                                     |
| GET    | `/:id/permisos`      | `VER_ROLES` o `ASIGNAR_PERMISOS` | Plantilla de permisos del rol (Lógica A).                                                                                        |
| POST   | `/:id/permisos`      | `ASIGNAR_PERMISOS`               | Reemplaza la plantilla (solo roles SISTEMA).                                                                                     |
| DELETE | `/:id/permisos/:pid` | `ASIGNAR_PERMISOS`               | Quita un permiso de la plantilla.                                                                                                |
| GET    | `/:id/usuarios`      | `VER_ROLES` o `ASIGNAR_ROLES`    | Usuarios con ese rol.                                                                                                            |

### Permisos (`/api/permisos`)

| Método | Ruta                        | Permiso              | Descripción                                          |
| ------ | --------------------------- | -------------------- | ---------------------------------------------------- |
| GET    | `/`                         | `VER_PERMISOS`       | Catálogo completo de permisos.                       |
| POST   | `/`                         | `CREAR_PERMISOS`     | Crea permiso (nombre único).                         |
| PATCH  | `/:id`                      | `MODIFICAR_PERMISOS` | Renombra permiso.                                    |
| DELETE | `/:id`                      | `ELIMINAR_PERMISOS`  | Elimina permiso (asignaciones en cascada).           |
| POST   | `/:uid/roles/:rid/permisos` | `ASIGNAR_PERMISOS`   | Asigna permisos al par (usuario, rol) PERSONALIZADO. |

### Incidencias (`/api/incidencias`)

| Método | Ruta                 | Permiso                 | Descripción                                                                                                                                |
| ------ | -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/`                  | `VER_INCIDENCIAS`       | Listado con filtros y paginación (`page`, `limit`).                                                                                        |
| GET    | `/valores-sugeridos` | `VER_INCIDENCIAS`       | Valores distintos para autocompletado.                                                                                                     |
| GET    | `/:id`               | `VER_INCIDENCIAS`       | Detalle de una incidencia.                                                                                                                 |
| POST   | `/`                  | `CREAR_INCIDENCIAS`     | Alta; `creado_por = sesión`; `fecha`/`hora_inicio` por MySQL.                                                                              |
| PATCH  | `/:id`               | `MODIFICAR_INCIDENCIAS` | Edita campos, `fecha` y `hora_inicio`; cierra con `{ cerrar: true }`; corrige `hora_fin` si ya está cerrada (recalcula `tiempo_solucion`). |
| PATCH  | `/:id/cerrar`        | `MODIFICAR_INCIDENCIAS` | Cierre directo con la hora del servidor.                                                                                                   |
| DELETE | `/:id`               | `ELIMINAR_INCIDENCIAS`  | Elimina incidencia.                                                                                                                        |

Parámetros de filtro del listado: `fecha_desde`, `fecha_hasta`, `centro`,
`sistema`, `incidencia`, `responsable`, `estado` (`abierta`|`cerrada`),
`creado_por` (autor de registro), `q` (ticket/descripción), `orden` (lista
blanca: `reciente`, `antiguo`, `fecha`, `centro`, `sistema`, `estado`,
`responsable`, `tiempo`, `id`), `asc`, `page`, `limit`. Un orden fuera de la lista blanca se descarta y cae en
el orden por defecto, así que nunca llega a la consulta. La respuesta trae
`pagination: { page, limit, total, totalPages }`, `filtros_aplicados` y
`estado: { total, abiertas, cerradas }`, de modo que las pills de resumen se
pintan sin una segunda petición.

### Dashboard (`/api/dashboard`, todas exigen `VER_DASHBOARD`)

| Método | Ruta                   | Descripción                                                                     |
| ------ | ---------------------- | ------------------------------------------------------------------------------- |
| GET    | `/kpis`                | Total, abiertas, cerradas, tasa de resolución, tiempo promedio, hoy y usuarios. |
| GET    | `/por-sistema`         | Top 10 sistemas con más incidencias.                                            |
| GET    | `/por-estado`          | Abiertas vs cerradas.                                                           |
| GET    | `/por-centro`          | Incidencias por centro (apiladas abiertas/cerradas).                            |
| GET    | `/por-tipo-incidencia` | Incidencias por tipo.                                                           |
| GET    | `/por-responsable`     | Top del responsable de negocio (texto libre).                                   |
| GET    | `/por-autor`           | Top del autor de registro (`creado_por`).                                       |
| GET    | `/por-tiempo-solucion` | Serie de tiempos (`limite`, por defecto 30) + promedio/mínimo/máximo.           |
| GET    | `/por-dia`             | Creadas/cerradas por día (`dias`, por defecto 30).                              |
| GET    | `/metadatos`           | Filtros: valores existentes de cada dimensión + rango con datos.                |
| GET    | `/heatmap`             | Matriz día de la semana × hora (disponible para uso futuro).                    |

Los endpoints del dashboard aceptan los mismos filtros globales que la web
(`fecha_desde`, `fecha_hasta`, `centro`, `sistema`, `incidencia`,
`responsable`, `estado`, `creado_por`); si el rango viene invertido se corrige
automáticamente.

Formatos de respuesta:

- Rankings por dimensión (`por-sistema`, `por-centro`, `por-tipo-incidencia`,
  `por-responsable`, `por-estado`): `[{ etiqueta, total, abiertas, cerradas }]`,
  con `etiqueta` en el idioma del dominio (p. ej. `ABIERTA`/`CERRADA`) y no el
  código crudo de la base.
- `por-autor`: `[{ id, usuario, nombre, total, abiertas, cerradas }]`, porque
  el autor es un usuario del sistema y necesita su id, no una etiqueta.
- `por-dia`: `[{ fecha, creadas, cerradas, promedio_minutos }]`.

## 11. Modelo de datos

| Tabla                     | Rol                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `usuarios`                | Cuentas del sistema (bcrypt, habilitado) con auditoría `creado_por`/`actualizado_por`.                            |
| `roles`                   | Catálogo de roles con discriminador `tipo` (`SISTEMA`/`PERSONALIZADO`) y auditoría.                               |
| `permisos`                | Catálogo de permisos (`VER_*`, `CREAR_*`, `MODIFICAR_*`, `ELIMINAR_*`, `ASIGNAR_*`) con auditoría.                |
| `usuarios_roles`          | Asignación usuario ↔ rol (N:M).                                                                                   |
| `roles_permisos`          | Lógica A: plantilla de permisos de un rol SISTEMA.                                                                |
| `usuarios_roles_permisos` | Lógica B: permisos por par (usuario, rol) con `concedido`.                                                        |
| `incidencias`             | Bitácora: datos del ticket y tiempos, con `responsable` de negocio y `creado_por`/`actualizado_por` de auditoría. |
| `sessions`                | La crea y mantiene `express-mysql-session` (sesiones de la app).                                                  |

Notas:

- `creado_en` / `actualizado_en` existen en usuarios, roles, permisos e
  incidencias (`TIMESTAMP(6)` con `DEFAULT` y `ON UPDATE`).
- `incidencias.fecha` y `hora_inicio` se rellenan en MySQL al insertar
  (`DEFAULT (CURRENT_DATE)` / `DEFAULT (CURRENT_TIME)`).
- Índices de apoyo: los compuestos que cubren cada filtro del dashboard
  (`idx_incidencias_fecha_tipo`, `idx_incidencias_centro_fecha`,
  `idx_incidencias_sistema_fecha`, `idx_incidencias_responsable_fecha`,
  `idx_incidencias_hora_fin_fecha`), los de FK de auditoría y, para los
  catálogos, `idx_roles_tipo` (filtro por tipo) e
  `idx_usuarios_habilitado_nombre` (listado alfabético). Las tablas pivote
  llevan índices inversos para responder "¿qué roles tienen este permiso?" o
  "¿qué usuarios tienen este rol?" sin escanear.
- **Los ids son `BIGINT` AUTO_INCREMENT** en todas las tablas. JavaScript solo es
  exacto hasta `Number.MAX_SAFE_INTEGER` (2^53−1) y mysql2 entrega como `string`
  cualquier `BIGINT` que no quepa en un número, de modo que un id grande nunca
  se trunca en silencio; el frontend normaliza con `Number(...)` al comparar
  contra los ids que le llegan de la API.
- Los ids de ruta se validan con `idNumerico()`, que exige un entero positivo
  dentro del rango seguro antes de que la consulta llegue al servicio.
- `responsable` es el **responsable de negocio** (texto libre, informativo). No
  es el usuario del sistema: ese es `creado_por`, y el dashboard los muestra en
  rankings separados (`/por-responsable` y `/por-autor`).
- La auditoría se firma con `req.session.userId`. `creado_por` y
  `actualizado_por` son columnas que **el cliente no puede escribir**: el
  servicio los fuerza a partir de la sesión aunque el body los incluya, y las
  rutas los rechazan en validación.

## 12. Rendimiento

La base de datos está en un MySQL gestionado (Aiven, región Fráncfort), con una
latencia de red de ~200 ms por consulta. Por eso el diseño prioriza **reducir
viajes** y **paralelizar lo independiente**:

- `obtenerPermisosEfectivos` resuelve las Lógicas A y B en **una sola consulta**
  (UNION): afecta a todas las peticiones protegidas, al login y a `/auth/me`.
- Los KPIs del dashboard se obtienen con **una consulta** con agregados
  condicionales (antes eran cinco consultas en serie).
- Listado de incidencias (filas + total + resumen por estado), listado de
  usuarios (usuarios + roles), serie y estadísticas de tiempos, login y
  `/auth/me` ejecutan sus consultas **en paralelo** con `Promise.all`.
- `GET /api/usuarios` resuelve en **una sola ida** al pool: los roles de todos
  los usuarios llegan agrupados por `usuario_id` y se reensamblan en memoria, en
  lugar de una consulta por usuario (N+1).
- El cierre/corrección de incidencias resuelve hora de fin y `tiempo_solucion`
  en una única consulta.
- El pool MySQL usa `enableKeepAlive` para evitar reconexiones (handshake
  TCP/TLS) cuando la base cierra conexiones inactivas.
- El frontend: el dashboard lanza sus 10 peticiones **en paralelo** desde
  `cargarTodo()` (metadatos, KPIs, serie de tiempos y los 7 gráficos), con un
  flag que corta el ciclo si el usuario sigue cambiando filtros —sin él dos
  renders simultáneos dejan un canvas en uso y Chart.js lanza error—;
  incidencias (sugerencias + listado) y usuarios (catálogos + listado) también,
  y cada página hace **una sola** llamada a `/api/auth/me` por carga.
- El despliegue en Render se configura en **Fráncfort** (`render.yml`) para
  quedar junto a la base y eliminar la mayor parte de la latencia de red.

## 13. Despliegue en Render

El Blueprint está en `backend/render.yml`. En Render: **New → Blueprint**,
apuntar al repositorio e indicar `backend/render.yml` como _Blueprint file path_.

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
- **Auditoría**: nunca escribas `creado_por`/`actualizado_por` a mano; toma el
  id de `req.session.userId` en el servicio y deja la columna fuera del cuerpo
  que acepta el cliente.
- **Transacciones**: las operaciones de varios pasos (cambio de tipo de rol,
  reemplazo de plantillas de permisos, permisos personalizados) van dentro de
  `withTransaction()` de `config/db.js`. Una transacción que solo hace
  `COMMIT` sin `try/catch` no protege nada.
- **Fechas mostradas**: usa `formatearFechaHora()` (fecha y hora local) en las
  tablas de auditoría; los filtros de rango comparan en fecha local con
  `fechaDentroDeRango()` (`api.js`). El pool usa `dateStrings` para los `DATE`,
  así que llegan como `YYYY-MM-DD` y no se reinterpretan por zona horaria.
- **Escapado**: todo valor que venga del servidor y se pinte en `innerHTML`
  pasa por `escaparHtml()`; `showToast()` ya escapa por ti, así que no le
  pases HTML.
