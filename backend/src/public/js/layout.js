let userPermissions = [];

async function checkAuth() {
  const me = await apiRequest('/auth/me');
  if (!me.ok) {
    window.location.href = 'index.html';
    return null;
  }
  userPermissions = me.permisos || [];
  return me;
}

function hasPermission(...perms) {
  return perms.some(p => userPermissions.includes(p));
}

function buildSidebar() {
  const sidebar = document.getElementById('sidebarNav');
  if (!sidebar) return;

  const menuItems = [];

  // Dashboard: visible si tiene VER_INCIDENCIAS (o VER_DASHBOARD si existe)
  if (hasPermission('VER_INCIDENCIAS', 'VER_DASHBOARD')) {
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
