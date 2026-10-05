-- Active: 1790856602221@@localhost@3306@bitacora_incidencias
-- ============================================================
-- BASE DE DATOS: bitacora_incidencias
-- ============================================================
-- LÓGICA A (roles.tipo = 'SISTEMA'):
--   Plantilla fija de permisos por rol en `roles_permisos`.
--   Aplica a TODOS los usuarios con ese rol.
--
-- LÓGICA B (roles.tipo = 'PERSONALIZADO'):
--   Sin plantilla. Cada usuario tiene su propio conjunto de
--   permisos en `usuarios_roles_permisos`.
--
-- REGLA DURA: un rol es SISTEMA o PERSONALIZADO, nunca ambos.
-- El discriminador es roles.tipo (chk_roles_tipo).
-- La separación de lógicas se garantiza en la capa de servicio
-- (backend), NO en la base de datos.
--
-- INCIDENCIAS:
--   * fecha y hora_inicio se rellenan AUTOMÁTICAMENTE al insertar.
--   * creado_en guarda fecha + hora exacta de creación.
--   * hora_fin y tiempo_solucion los envía el backend al cerrar.
--   * tiempo_solucion = hora_fin - hora_inicio (calculado en backend).
--   * usuario_id = quién la creó (FK a usuarios).
--   * responsable = quién la atiende (texto libre).
--
-- REQUIERE: MySQL 8.0.13+ (por DEFAULT (CURRENT_DATE) / DEFAULT (CURRENT_TIME))
-- ============================================================

CREATE DATABASE IF NOT EXISTS bitacora_incidencias
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE bitacora_incidencias;

SET NAMES utf8mb4;

-- ============================================================
-- 1) usuarios — catálogo de usuarios (lógica común)
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario         VARCHAR(50)  NOT NULL,
    contrasena      VARCHAR(100) NOT NULL,
    nombre          VARCHAR(100) NOT NULL,
    apellido        VARCHAR(100) NOT NULL,
    email           VARCHAR(100) NOT NULL,
    telefono        VARCHAR(20)  NULL,
    habilitado      BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    actualizado_en  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                    ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT uq_usuarios_usuario UNIQUE (usuario),
    CONSTRAINT uq_usuarios_email   UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Usuarios del sistema. Independiente de la lógica de permisos.';

-- ============================================================
-- 2) roles — catálogo de roles con DISCRIMINADOR de lógica
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    nombre          VARCHAR(50) NOT NULL,
    tipo            VARCHAR(20) NOT NULL DEFAULT 'SISTEMA',
    creado_en       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    actualizado_en  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                    ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT uq_roles_nombre UNIQUE (nombre),
    CONSTRAINT chk_roles_tipo CHECK (
        tipo IN ('SISTEMA','PERSONALIZADO')
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Roles. tipo=SISTEMA -> Lógica A (plantilla en roles_permisos). tipo=PERSONALIZADO -> Lógica B (permisos por usuario en usuarios_roles_permisos).';

-- ============================================================
-- 3) permisos — catálogo de permisos (lógica común)
-- ============================================================
CREATE TABLE IF NOT EXISTS permisos (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    nombre          VARCHAR(50) NOT NULL,
    creado_en       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    actualizado_en  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                    ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT uq_permisos_nombre UNIQUE (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Catálogo de permisos. NOTA: CREAR_INCIDENCIA incluye crear, poner responsable y cerrar la incidencia.';

-- ============================================================
-- 4) roles_permisos — LÓGICA A (plantilla por rol de sistema)
--    Solo debe contener filas para roles con tipo='SISTEMA'.
--    La restricción se garantiza en el backend.
-- ============================================================
CREATE TABLE IF NOT EXISTS roles_permisos (
    rol_id      BIGINT NOT NULL,
    permiso_id  BIGINT NOT NULL,
    creado_en   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (rol_id, permiso_id),
    CONSTRAINT fk_roles_permisos_rol_id
        FOREIGN KEY (rol_id)     REFERENCES roles (id)    ON DELETE CASCADE,
    CONSTRAINT fk_roles_permisos_permiso_id
        FOREIGN KEY (permiso_id) REFERENCES permisos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Lógica A: plantilla fija de permisos. Solo roles tipo=SISTEMA (garantizado en backend).';

-- ============================================================
-- 5) usuarios_roles — asignación usuario <-> rol
--    Tabla de unión pura, COMPARTIDA por ambas lógicas.
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios_roles (
    usuario_id  BIGINT NOT NULL,
    rol_id      BIGINT NOT NULL,
    creado_en   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (usuario_id, rol_id),
    CONSTRAINT fk_usuarios_roles_usuario_id
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT fk_usuarios_roles_rol_id
        FOREIGN KEY (rol_id)     REFERENCES roles (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Asignación usuario-rol, compartida por Lógica A y Lógica B.';

-- ============================================================
-- 6) usuarios_roles_permisos — LÓGICA B (permisos por usuario)
--    Solo debe contener filas para roles con tipo='PERSONALIZADO'.
--    El par (usuario_id, rol_id) debe existir en usuarios_roles.
--    Ambas restricciones se garantizan en el backend.
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios_roles_permisos (
    usuario_id  BIGINT NOT NULL,
    rol_id      BIGINT NOT NULL,
    permiso_id  BIGINT NOT NULL,
    concedido   BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (usuario_id, rol_id, permiso_id),
    CONSTRAINT fk_urp_usuario_id
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT fk_urp_rol_id
        FOREIGN KEY (rol_id)     REFERENCES roles (id)    ON DELETE CASCADE,
    CONSTRAINT fk_urp_permiso_id
        FOREIGN KEY (permiso_id) REFERENCES permisos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Lógica B: permisos personalizados por (usuario, rol). Solo roles tipo=PERSONALIZADO (garantizado en backend).';

-- ============================================================
-- 7) incidencias — Bitácora
--    * fecha y hora_inicio se rellenan AUTOMÁTICAMENTE al insertar.
--    * creado_en guarda fecha + hora exacta de creación.
--    * hora_fin y tiempo_solucion los envía el backend al cerrar.
--    * usuario_id = quién la creó (FK a usuarios).
--    * responsable = quién la atiende (texto libre).
-- ============================================================
CREATE TABLE IF NOT EXISTS incidencias (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    tipo_centro       VARCHAR(20)  NOT NULL,
    centro            VARCHAR(50)  NOT NULL,
    sistema           VARCHAR(50)  NOT NULL,
    incidencia        VARCHAR(50)  NOT NULL,
    ticket            VARCHAR(59)  NOT NULL,
    usuario_id        BIGINT       NOT NULL COMMENT 'Usuario que registró la incidencia.',
    responsable       VARCHAR(60)  NOT NULL COMMENT 'Quién atiende (texto libre).',
    descripcion       VARCHAR(255) NOT NULL,
    fecha             DATE         NOT NULL DEFAULT (CURRENT_DATE),
    hora_inicio       TIME         NOT NULL DEFAULT (CURRENT_TIME),
    hora_fin          TIME         NULL,
    tiempo_solucion   TIME         NULL COMMENT 'HH:MM:SS. Lo calcula el backend.',
    creado_en         TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    actualizado_en    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                      ON UPDATE CURRENT_TIMESTAMP(6),

    CONSTRAINT uq_incidencias_ticket UNIQUE (ticket),
    CONSTRAINT chk_incidencias_tipo_centro CHECK (
        tipo_centro IN ('DISTRIBUCION','TRANSFERENCIA')
    ),
    CONSTRAINT fk_incidencias_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_incidencias_usuario      (usuario_id),
    INDEX idx_incidencias_centro       (centro),
    INDEX idx_incidencias_sistema      (sistema),
    INDEX idx_incidencias_fecha        (fecha),
    INDEX idx_incidencias_responsable  (responsable)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bitácora de incidencias. fecha y hora_inicio se rellenan solas. hora_fin y tiempo_solucion los pone el backend.';

-- ============================================================
-- DATOS INICIALES (idempotentes: INSERT IGNORE)
-- ============================================================

-- Roles
INSERT IGNORE INTO roles (nombre, tipo) VALUES
    ('ADMINISTRADOR', 'SISTEMA'),
    ('SUPERVISOR',    'PERSONALIZADO'),
    ('ASISTENTE',     'PERSONALIZADO');

-- Permisos
INSERT IGNORE INTO permisos (nombre) VALUES
    -- Roles y permisos
    ('ASIGNAR_ROLES'),
    ('ASIGNAR_PERMISOS'),
    ('VER_PERMISOS'),
    ('VER_ROLES'),
    ('CREAR_ROLES'),
    ('CREAR_PERMISOS'),
    -- Usuarios
    ('VER_USUARIOS'),
    ('CREAR_USUARIO'),
    -- Incidencias
    ('VER_INCIDENCIAS'),
    ('VER_DASHBOARD'),
    ('CREAR_INCIDENCIA'),
    ('MODIFICAR_INCIDENCIA'),
    ('ELIMINAR_INCIDENCIA');

-- ============================================================
-- 1) Crear el usuario administrador
-- ============================================================
-- ⚠️ La contraseña debe ir HASHEADA (bcrypt, cost=10).
--    El hash de abajo es la contraseña inicial de ejemplo del proyecto.
--    Cámbiala tras el primer inicio de sesión (módulo Usuarios) y nunca
--    escribas la contraseña en claro en este archivo ni en el README.
-- ============================================================
INSERT IGNORE INTO usuarios
    (usuario, contrasena, nombre, apellido, email, telefono, habilitado)
VALUES (
    'admin',
    '$2b$10$kP8pFh0lysUsmzmBM6m1SeAxY9F6ILXi1JQ5YpnxxEEn6mXhDs9Dm',
    'Admin',
    'Inicial',
    'admin@example.com',
    NULL,
    TRUE
);

-- ============================================================
-- 2) Asignar el rol ADMINISTRADOR al usuario admin
-- ============================================================
INSERT IGNORE INTO usuarios_roles (usuario_id, rol_id)
SELECT u.id, r.id
FROM usuarios u
JOIN roles r ON r.nombre = 'ADMINISTRADOR'
WHERE u.usuario = 'admin';

-- ============================================================
-- 3) Dar TODOS los permisos al rol ADMINISTRADOR (Lógica A)
-- ============================================================
INSERT IGNORE INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'ADMINISTRADOR';
