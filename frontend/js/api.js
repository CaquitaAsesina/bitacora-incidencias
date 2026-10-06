/**
 * =====================================================================
 * js/api.js — Utilidades base del frontend (compartidas por todas las páginas)
 * =====================================================================
 * Contiene:
 *   - apiRequest(): wrapper de fetch contra /api con manejo global de 401/403.
 *   - paginaInicio(): decide la primera página accesible según permisos.
 *   - showToast(): notificaciones Bootstrap.
 *
 * Se carga ANTES que layout.js y que el script de cada página.
 * Para extender: agrega aquí helpers reutilizables por varias páginas.
 * =====================================================================
 */
const API_BASE = '/api';

/** @returns {boolean} true si estamos en la página de login. */
function isLoginPage() {
  const path = window.location.pathname;
  return path.includes('index.html') || path === '/' || path.endsWith('/');
}

/**
 * Devuelve la primera página accesible para un conjunto de permisos.
 * El Dashboard solo es accesible con VER_DASHBOARD; el resto de módulos
 * usan su permiso de visualización/gestión. Devuelve null si el usuario no
 * tiene acceso a ninguna página.
 *
 * Los nombres son los del catálogo de `backend/schema.sql`: en plural y con
 * permisos separados por operación (CREAR_* / MODIFICAR_* / ELIMINAR_*).
 */
function paginaInicio(permisos = []) {
  const tiene = (...perms) => perms.some((p) => permisos.includes(p));
  if (tiene('VER_DASHBOARD')) return 'dashboard.html';
  if (tiene('VER_INCIDENCIAS', 'CREAR_INCIDENCIAS', 'MODIFICAR_INCIDENCIAS', 'ELIMINAR_INCIDENCIAS')) return 'incidencias.html';
  // ASIGNAR_ROLES vive en roles.html, asi que se comprueba antes que usuarios.html:
  // el boton 'asignar rol a usuario' esta ahi y usuarios.html exige VER_USUARIOS.
  if (tiene('VER_ROLES', 'CREAR_ROLES', 'MODIFICAR_ROLES', 'ELIMINAR_ROLES', 'ASIGNAR_ROLES')) return 'roles.html';
  if (tiene('VER_USUARIOS', 'CREAR_USUARIOS', 'MODIFICAR_USUARIOS', 'ELIMINAR_USUARIOS', 'ASIGNAR_PERMISOS')) return 'usuarios.html';
  if (tiene('VER_PERMISOS', 'CREAR_PERMISOS', 'MODIFICAR_PERMISOS', 'ELIMINAR_PERMISOS', 'ASIGNAR_PERMISOS')) return 'permisos.html';
  return null;
}

/**
 * Nombres de permisos del catálogo, centralizados para que las páginas no
 * repitan cadenas literales. Cualquier cambio en `schema.sql` se refleja aquí
 * una sola vez.
 *
 * `gestionModulo(permisos, modulo)` indica si el usuario puede ver el módulo y
 * al menos una de sus acciones, que es lo que decide si aparece en el sidebar.
 */
const PERMISOS = {
  DASHBOARD: { VER: 'VER_DASHBOARD' },
  INCIDENCIAS: {
    VER: 'VER_INCIDENCIAS',
    CREAR: 'CREAR_INCIDENCIAS',
    MODIFICAR: 'MODIFICAR_INCIDENCIAS',
    ELIMINAR: 'ELIMINAR_INCIDENCIAS',
  },
  USUARIOS: {
    VER: 'VER_USUARIOS',
    CREAR: 'CREAR_USUARIOS',
    MODIFICAR: 'MODIFICAR_USUARIOS',
    ELIMINAR: 'ELIMINAR_USUARIOS',
    ASIGNAR_ROLES: 'ASIGNAR_ROLES',
    ASIGNAR_PERMISOS: 'ASIGNAR_PERMISOS',
  },
  ROLES: {
    VER: 'VER_ROLES',
    CREAR: 'CREAR_ROLES',
    MODIFICAR: 'MODIFICAR_ROLES',
    ELIMINAR: 'ELIMINAR_ROLES',
  },
  PERMISOS: {
    VER: 'VER_PERMISOS',
    CREAR: 'CREAR_PERMISOS',
    MODIFICAR: 'MODIFICAR_PERMISOS',
    ELIMINAR: 'ELIMINAR_PERMISOS',
  },
};

/**
 * Realiza una petición JSON a la API.
 * Maneja globalmente: 401 (redirige al login salvo en la página de login) y
 * 403 (avisa con toast). Devuelve siempre un objeto JSON ({ ok, ... }).
 * @param {string} endpoint ruta relativa, p. ej. '/incidencias'.
 * @param {RequestInit} [options]
 * @returns {Promise<object>}
 */
async function apiRequest(endpoint, options = {}) {
  const config = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);

    // El 401 del login es una respuesta normal (credenciales inválidas):
    // se lee el JSON para no perder el mensaje real del backend. En el resto
    // de páginas un 401 significa sesión expirada y redirige al login.
    if (response.status === 401 && !isLoginPage()) {
      window.location.href = 'index.html';
      return { ok: false, mensaje: 'No autorizado' };
    }

    if (response.status === 403) {
      if (typeof showToast === 'function') {
        showToast('Sin permisos para realizar esta acción', 'warning');
      }
      return { ok: false, mensaje: 'Sin permisos' };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error en solicitud API:', error);
    return { ok: false, mensaje: 'Error de conexión' };
  }
}

/**
 * Comprueba si una fecha del API (ISO/timestamp) cae dentro de un rango local
 * [desde, hasta] en formato YYYY-MM-DD (ambos extremos opcionales e inclusivos).
 * Se usa en los filtros de fecha de las tablas.
 * @param {string|null} valor timestamp del API (p. ej. creado_en)
 * @param {string} desde fecha YYYY-MM-DD o ''
 * @param {string} hasta fecha YYYY-MM-DD o ''
 * @returns {boolean}
 */
function fechaDentroDeRango(valor, desde, hasta) {
  if (!desde && !hasta) return true;
  if (!valor) return false;

  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return false;

  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  const fecha = `${d.getFullYear()}-${mes}-${dia}`;

  if (desde && fecha < desde) return false;
  if (hasta && fecha > hasta) return false;
  return true;
}

/**
 * Formatea un timestamp del API en fecha y hora local.
 *
 * MySQL devuelve 'YYYY-MM-DD HH:MM:SS' sin zona horaria: `new Date()` con ese
 * formato se interpretaría como UTC y desplazaría la hora. Por eso se cambia el
 * espacio por una 'T' antes de parsear, para que se lea como hora local.
 * @param {string|null} valor
 * @returns {string} 'DD/MM/AAAA HH:MM' o '-' si no hay fecha válida.
 */
function formatearFechaHora(valor) {
  if (!valor) return '-';
  const fecha = new Date(String(valor).replace(' ', 'T'));
  if (Number.isNaN(fecha.getTime())) return '-';
  return fecha.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Escapa un valor para insertarlo dentro de HTML.
 *
 * Todas las páginas pintan los datos del API con innerHTML, así que cualquier
 * campo de texto (usuario, centro, ticket, nombre de rol…) debe pasar por
 * aquí: sin escape, un valor con `<` rompería el marcado y un `<script>`
 * ejecutaría código en el navegador de quien tenga la sesión abierta.
 *
 * Usa textContent en lugar de reemplazar caracteres a mano: el navegador
 * aplica las mismas reglas que usaría al mostrar el texto, sin sorpresas.
 * @param {*} valor
 * @returns {string} HTML seguro para interpolar.
 */
function escaparHtml(valor) {
  const div = document.createElement('div');
  div.textContent = valor === null || valor === undefined ? '' : valor;
  return div.innerHTML;
}

/**
 * Muestra una notificación Bootstrap.
 * El mensaje se escapa: varios avisos incluyen texto devuelto por el servidor
 * (p. ej. el detalle de un error de validación) y ese texto no es de fiar.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type]
 */
function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    return;
  }

  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'info'} border-0`;
  toastEl.setAttribute('role', 'alert');
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${escaparHtml(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;
  toastContainer.appendChild(toastEl);
  const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
  toast.show();
}
