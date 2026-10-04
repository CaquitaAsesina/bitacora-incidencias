const API_BASE = '/api';

function isLoginPage() {
  const path = window.location.pathname;
  return path.includes('index.html') || path === '/' || path.endsWith('/');
}

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
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;
  toastContainer.appendChild(toastEl);
  const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
  toast.show();
}
