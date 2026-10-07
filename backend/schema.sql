-- Active: 1791152181635@@127.0.0.1@3306@bitacora_incidencias
CREATE DATABASE IF NOT EXISTS bitacora_incidencias CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE bitacora_incidencias;

SET NAMES utf8mb4;

-- ============================================================
-- 1) usuarios
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Identificador único del usuario.',
    usuario VARCHAR(50) NOT NULL COMMENT 'Nombre de login, único. Se usa para iniciar sesión.',
    contrasena VARCHAR(100) NOT NULL COMMENT 'Contraseña hasheada con bcrypt (nunca en texto plano).',
    nombre VARCHAR(100) NOT NULL COMMENT 'Nombre real del usuario.',
    apellido VARCHAR(100) NOT NULL COMMENT 'Apellido real del usuario.',
    email VARCHAR(100) NOT NULL COMMENT 'Correo electrónico único del usuario.',
    telefono VARCHAR(20) NULL COMMENT 'Teléfono de contacto. Opcional.',
    habilitado BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'TRUE = puede iniciar sesión; FALSE = bloqueado.',
    creado_por BIGINT DEFAULT NULL COMMENT 'ID del usuario que creó este registro. NULL si es el primero.',
    actualizado_por BIGINT NOT NULL COMMENT 'ID del usuario que actualizó el registro por última vez.',
    creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Fecha y hora exacta de creación.',
    actualizado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'Fecha y hora de la última modificación (auto).',
    CONSTRAINT uq_usuarios_usuario UNIQUE (usuario),
    CONSTRAINT uq_usuarios_email UNIQUE (email),
    INDEX idx_usuarios_habilitado_nombre (habilitado, apellido, nombre) COMMENT 'Listados de usuarios activos/bloqueados ordenados alfabéticamente. Cubre también filtros solo por habilitado.',
    INDEX idx_usuarios_creado_en (creado_en) COMMENT 'Ordenamiento temporal de usuarios por fecha de alta.'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Usuarios del sistema. Independiente de la lógica de permisos.';

-- ============================================================
-- 2) roles
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Identificador único del rol.',
    nombre VARCHAR(50) NOT NULL COMMENT 'Nombre del rol, único. Ej: ADMINISTRADOR.',
    tipo VARCHAR(20) NOT NULL DEFAULT 'SISTEMA' COMMENT 'Discriminador de lógica: SISTEMA (A) o PERSONALIZADO (B).',
    creado_por BIGINT NOT NULL COMMENT 'ID del usuario que creó el rol.',
    actualizado_por BIGINT NOT NULL COMMENT 'ID del usuario que modificó el rol por última vez.',
    creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Fecha y hora exacta de creación del rol.',
    actualizado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'Fecha y hora de la última modificación.',
    CONSTRAINT uq_roles_nombre UNIQUE (nombre),
    CONSTRAINT chk_roles_tipo CHECK (
        tipo IN ('SISTEMA', 'PERSONALIZADO')
    ),
    INDEX idx_roles_tipo (tipo) COMMENT 'Filtrado de roles por lógica (SISTEMA vs PERSONALIZADO). Poca cardinalidad pero consultas frecuentes en backend.'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Roles. tipo=SISTEMA -> Lógica A (plantilla en roles_permisos). tipo=PERSONALIZADO -> Lógica B (permisos por usuario en usuarios_roles_permisos).';

-- ============================================================
-- 3) permisos
-- ============================================================
CREATE TABLE IF NOT EXISTS permisos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Identificador único del permiso.',
    nombre VARCHAR(50) NOT NULL COMMENT 'Nombre del permiso, único. Ej: CREAR_INCIDENCIAS.',
    creado_por BIGINT NOT NULL COMMENT 'ID del usuario que creó el permiso.',
    actualizado_por BIGINT NOT NULL COMMENT 'ID del usuario que modificó el permiso por última vez.',
    creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Fecha y hora exacta de creación del permiso.',
    actualizado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'Fecha y hora de la última modificación.',
    CONSTRAINT uq_permisos_nombre UNIQUE (nombre)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Catálogo de permisos. CREAR_INCIDENCIAS incluye crear, poner responsable y cerrar la incidencia.';

-- ============================================================
-- 4) roles_permisos — Lógica A
-- ============================================================
CREATE TABLE IF NOT EXISTS roles_permisos (
    rol_id BIGINT NOT NULL COMMENT 'FK al rol (parte de la PK compuesta).',
    permiso_id BIGINT NOT NULL COMMENT 'FK al permiso (parte de la PK compuesta).',
    creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Fecha y hora en que se asignó el permiso al rol.',
    PRIMARY KEY (rol_id, permiso_id),
    CONSTRAINT fk_roles_permisos_rol_id FOREIGN KEY (rol_id) REFERENCES roles (id) ON DELETE CASCADE,
    CONSTRAINT fk_roles_permisos_permiso_id FOREIGN KEY (permiso_id) REFERENCES permisos (id) ON DELETE CASCADE,
    INDEX idx_roles_permisos_permiso_id (permiso_id, rol_id) COMMENT 'Reverse lookup: qué roles tienen un permiso concreto. Evita escaneo al borrar/auditar permisos.'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Lógica A: plantilla fija de permisos. Solo roles tipo=SISTEMA (garantizado en backend).';

-- ============================================================
-- 5) usuarios_roles
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios_roles (
    usuario_id BIGINT NOT NULL COMMENT 'FK al usuario (parte de la PK compuesta).',
    rol_id BIGINT NOT NULL COMMENT 'FK al rol (parte de la PK compuesta).',
    creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Fecha y hora en que se asignó el rol al usuario.',
    PRIMARY KEY (usuario_id, rol_id),
    CONSTRAINT fk_usuarios_roles_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT fk_usuarios_roles_rol_id FOREIGN KEY (rol_id) REFERENCES roles (id) ON DELETE CASCADE,
    INDEX idx_usuarios_roles_rol_id (rol_id, usuario_id) COMMENT 'Reverse lookup: qué usuarios tienen un rol concreto. Crítico para listados masivos por rol.'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Asignación usuario-rol, compartida por Lógica A y Lógica B.';

-- ============================================================
-- 6) usuarios_roles_permisos — Lógica B
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios_roles_permisos (
    usuario_id BIGINT NOT NULL COMMENT 'FK al usuario (parte de la PK compuesta).',
    rol_id BIGINT NOT NULL COMMENT 'FK al rol personalizado (parte de la PK compuesta).',
    permiso_id BIGINT NOT NULL COMMENT 'FK al permiso (parte de la PK compuesta).',
    creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Fecha y hora en que se otorgó el permiso.',
    PRIMARY KEY (
        usuario_id,
        rol_id,
        permiso_id
    ),
    CONSTRAINT fk_urp_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT fk_urp_rol_id FOREIGN KEY (rol_id) REFERENCES roles (id) ON DELETE CASCADE,
    CONSTRAINT fk_urp_permiso_id FOREIGN KEY (permiso_id) REFERENCES permisos (id) ON DELETE CASCADE,
    INDEX idx_urp_rol_usuario (rol_id, usuario_id) COMMENT 'Reverse: qué usuarios tienen permisos personalizados bajo un rol concreto.',
    INDEX idx_urp_permiso (permiso_id) COMMENT 'Reverse: qué usuarios tienen un permiso concreto.'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Lógica B: permisos personalizados por (usuario, rol). Solo roles tipo=PERSONALIZADO (garantizado en backend).';

-- ============================================================
-- 7) incidencias
-- ============================================================

CREATE TABLE IF NOT EXISTS incidencias (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Identificador único de la incidencia.',
    centro VARCHAR(50) NOT NULL COMMENT 'Nombre de la sede. Ej: CD PUNTA NEGRA.',
    sistema VARCHAR(50) NOT NULL COMMENT 'Sistema donde ocurrió la incidencia.',
    incidencia VARCHAR(50) NOT NULL COMMENT 'Tipo o categoría de la incidencia.',
    ticket VARCHAR(59) NOT NULL COMMENT 'Número de ticket asociado, tiene que ser único.',
    responsable VARCHAR(60) NOT NULL COMMENT 'Quién atiende la incidencia (texto libre).',
    descripcion VARCHAR(255) NOT NULL COMMENT 'Descripción detallada del problema o solución.',
    hora_inicio TIME NOT NULL DEFAULT(CURRENT_TIME) COMMENT 'Hora de inicio (auto al insertar).',
    hora_fin TIME NULL COMMENT 'Hora de cierre. NULL mientras la incidencia esté abierta.',
    tiempo_solucion TIME NULL COMMENT 'Tiempo total de solución (HH:MM:SS). Lo calcula el backend.',
    creado_por BIGINT NOT NULL COMMENT 'FK al usuario que creó la incidencia.',
    actualizado_por BIGINT NOT NULL COMMENT 'FK al usuario que modificó la incidencia por última vez.',
    creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Fecha y hora exacta de creación del registro.',
    actualizado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'Fecha y hora de la última modificación (auto).',
    CONSTRAINT uq_incidencias_ticket UNIQUE (ticket),
    CONSTRAINT fk_incidencias_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_incidencias_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuarios (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_incidencias_centro_creado_en (centro, creado_en) COMMENT 'Reportes por centro en un rango de fecha. Cubre también consultas solo por centro.',
    INDEX idx_incidencias_sistema_creado_en (sistema, creado_en) COMMENT 'Reportes por sistema en un rango de fecha. Cubre también consultas solo por sistema.',
    INDEX idx_incidencias_incidencia_creado_en (incidencia, creado_en) COMMENT 'Reportes por tipo de incidencia en un rango de fecha. Cubre también consultas solo por tipo.',
    INDEX idx_incidencias_responsable_creado_en (responsable, creado_en) COMMENT 'Reportes por responsable en un rango de fecha. Cubre también consultas solo por responsable.',
    INDEX idx_incidencias_hora_fin_creado_en (hora_fin, creado_en) COMMENT 'Incidencias abiertas (hora_fin IS NULL) dentro de un rango de fecha.',
    INDEX idx_incidencias_creado_en (creado_en) COMMENT 'Ordenamiento y filtrado general por fecha de creación.',
    INDEX idx_incidencias_creado_por (creado_por) COMMENT 'FK: JOIN con usuarios creador y validación de RESTRICT en DELETE.',
    INDEX idx_incidencias_actualizado_por (actualizado_por) COMMENT 'FK: JOIN con usuarios que modificó y validación de RESTRICT en DELETE.'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Bitácora de incidencias. hora_inicio se rellena sola. hora_fin y tiempo_solucion los pone el backend.';

-- ============================================================
-- DATOS INICIALES
-- ============================================================

INSERT IGNORE INTO
    roles (
        nombre,
        tipo,
        creado_por,
        actualizado_por
    )
VALUES (
        'ADMINISTRADOR',
        'SISTEMA',
        0,
        0
    ),
    (
        'SUPERVISOR',
        'PERSONALIZADO',
        0,
        0
    ),
    (
        'ASISTENTE',
        'PERSONALIZADO',
        0,
        0
    );

INSERT IGNORE INTO
    permisos (
        nombre,
        creado_por,
        actualizado_por
    )
VALUES ('ASIGNAR_ROLES', 0, 0),
    ('VER_ROLES', 0, 0),
    ('CREAR_ROLES', 0, 0),
    ('MODIFICAR_ROLES', 0, 0),
    ('ELIMINAR_ROLES', 0, 0),
    ('ASIGNAR_PERMISOS', 0, 0),
    ('VER_PERMISOS', 0, 0),
    ('CREAR_PERMISOS', 0, 0),
    ('MODIFICAR_PERMISOS', 0, 0),
    ('ELIMINAR_PERMISOS', 0, 0),
    ('VER_USUARIOS', 0, 0),
    ('CREAR_USUARIOS', 0, 0),
    ('MODIFICAR_USUARIOS', 0, 0),
    ('ELIMINAR_USUARIOS', 0, 0),
    ('VER_INCIDENCIAS', 0, 0),
    ('VER_DASHBOARD', 0, 0),
    ('CREAR_INCIDENCIAS', 0, 0),
    ('MODIFICAR_INCIDENCIAS', 0, 0),
    ('ELIMINAR_INCIDENCIAS', 0, 0);

INSERT IGNORE INTO
    usuarios (
        usuario,
        contrasena,
        nombre,
        apellido,
        email,
        telefono,
        habilitado,
        actualizado_por
    )
VALUES (
        'admin',
        '$2b$10$kP8pFh0lysUsmzmBM6m1SeAxY9F6ILXi1JQ5YpnxxEEn6mXhDs9Dm',
        'Admin',
        'Inicial',
        'admin@example.com',
        NULL,
        TRUE,
        0
    );

INSERT IGNORE INTO
    usuarios_roles (usuario_id, rol_id)
SELECT u.id, r.id
FROM usuarios u
    JOIN roles r ON r.nombre = 'ADMINISTRADOR'
WHERE
    u.usuario = 'admin';

INSERT IGNORE INTO
    roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
    CROSS JOIN permisos p
WHERE
    r.nombre = 'ADMINISTRADOR';