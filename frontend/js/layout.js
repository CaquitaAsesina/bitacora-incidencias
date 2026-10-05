/**
 * =====================================================================
 * js/layout.js — Layout común (barra de usuario y menú lateral)
 * =====================================================================
 * Responsabilidades:
 *   - checkAuth(): valida la sesión y guarda los permisos efectivos.
 *   - hasPermission(): consulta local de permisos (OR).
 *   - buildSidebar(): pinta el menú según permisos del usuario.
 *   - initLayout(): punto de entrada (DOMContentLoaded).
 *
 * Debe cargarse después de api.js y antes que el script de cada página.
 * Para agregar una entrada de menú: añade un bloque en buildSidebar() con su
 * hasPermission(...) correspondiente.
 * =====================================================================
 */
let userPermissions = [];

/**
 * Verifica la sesión. Si no hay, redirige al login.
 * @returns {Promise<object|null>} datos de /auth/me (y guarda userPermissions) o null.
 */
async function checkAuth() {
  const me = await apiRequest('/auth/me');
  if (!me.ok) {
    window.location.href = 'index.html';
    return null;
  }
  userPermissions = me.permisos || [];
  return me;
}

/**
 * @param {...string} perms
 * @returns {boolean} true si el usuario tiene AL MENOS UNO de los permisos (OR).
 */
function hasPermission(...perms) {
  return perms.some(p => userPermissions.includes(p));
}

/** Construye el menú lateral según los permisos y marca la página activa. */
function buildSidebar() {
  const sidebar = document.getElementById('sidebarNav');
  if (!sidebar) return;

  const menuItems = [];

  // Dashboard: visible solo con VER_DASHBOARD
  if (hasPermission('VER_DASHBOARD')) {
    menuItems.push({
      href: 'dashboard.html',
      icon: 'bi-speedometer2',
      text: 'Dashboard',
    });
  }

  // Incidencias
  if (hasPermission('VER_INCIDENCIAS', 'CREAR_INCIDENCIA', 'MODIFICAR_INCIDENCIA', 'ELIMINAR_INCIDENCIA')) {
    menuItems.push({
      href: 'incidencias.html',
      icon: 'bi-journal-text',
      text: 'Incidencias',
    });
  }

  // Usuarios
  if (hasPermission('VER_USUARIOS', 'CREAR_USUARIO', 'ASIGNAR_ROLES', 'ASIGNAR_PERMISOS')) {
    menuItems.push({
      href: 'usuarios.html',
      icon: 'bi-people',
      text: 'Usuarios',
    });
  }

  // Roles
  if (hasPermission('VER_ROLES', 'CREAR_ROLES', 'ASIGNAR_ROLES')) {
    menuItems.push({
      href: 'roles.html',
      icon: 'bi-person-badge',
      text: 'Roles',
    });
  }

  // Permisos
  if (hasPermission('VER_PERMISOS', 'CREAR_PERMISOS', 'ASIGNAR_PERMISOS')) {
    menuItems.push({
      href: 'permisos.html',
      icon: 'bi-key',
      text: 'Permisos',
    });
  }

  sidebar.innerHTML = menuItems.map(item => `
    <li class="nav-item">
      <a class="nav-link" href="${item.href}">
        <i class="bi ${item.icon} me-2"></i>${item.text}
      </a>
    </li>
  `).join('');

  // Marcar activo
  const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
  sidebar.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
    }
  });
}

/** Inicializa el layout: datos de usuario, logout y menú. */
async function initLayout() {
  const userData = await checkAuth();
  if (!userData) return;

  const userInfo = document.getElementById('userInfo');
  if (userInfo) {
    userInfo.textContent = `${userData.usuario.nombre} ${userData.usuario.apellido}`;
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await apiRequest('/auth/logout', { method: 'POST' });
      window.location.href = 'index.html';
    });
  }

  buildSidebar();
}

document.addEventListener('DOMContentLoaded', initLayout);
