/**
 * =====================================================================
 * js/roles.js — Gestión de roles (roles.html)
 * =====================================================================
 * CRUD de roles, asignación de un rol a un usuario y listado de usuarios de
 * un rol. El conteo de usuarios por rol se deriva de usuariosData para evitar
 * peticiones extra (evita N+1).
 *
 * Los botones de fila llaman funciones globales (window.*).
 * =====================================================================
 */
let rolesData = [];
let usuariosData = []; // se usa para contar usuarios por rol sin pedir más datos
const modalRol = new bootstrap.Modal(document.getElementById('modalRol'));
const modalAsignarRolUsuario = new bootstrap.Modal(document.getElementById('modalAsignarRolUsuario'));
const modalUsuariosRol = new bootstrap.Modal(document.getElementById('modalUsuariosRol'));
let rolUsuariosActual = null;

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  
  if (hasPermission('CREAR_ROLES')) {
    document.getElementById('btnNuevoRol').style.display = 'inline-block';
    document.getElementById('btnNuevoRol').addEventListener('click', abrirModalNuevoRol);
    document.getElementById('btnGuardarRol').addEventListener('click', guardarRol);
  }
  
  if (hasPermission('ASIGNAR_ROLES')) {
    document.getElementById('btnAsignarRolUsuario').style.display = 'inline-block';
    document.getElementById('btnAsignarRolUsuario').addEventListener('click', abrirModalAsignarRol);
    document.getElementById('btnGuardarAsignarRolUsuario').addEventListener('click', guardarAsignarRolUsuario);
  }
  
  document.getElementById('filtroNombreRol').addEventListener('input', renderTablaRoles);
  document.getElementById('filtroTipoRol').addEventListener('change', renderTablaRoles);
  document.getElementById('btnFiltrarRoles').addEventListener('click', renderTablaRoles);
  document.getElementById('btnLimpiarFiltrosRoles').addEventListener('click', () => {
    document.getElementById('filtroNombreRol').value = '';
    document.getElementById('filtroTipoRol').value = '';
    renderTablaRoles();
  });

  await cargarDatos();
});

/** Carga roles y usuarios en paralelo y repinta la tabla. */
async function cargarDatos() {
  const [rolesRes, usuariosRes] = await Promise.all([
    apiRequest('/roles'),
    apiRequest('/usuarios'),
  ]);
  if (rolesRes.ok) rolesData = rolesRes.data;
  if (usuariosRes.ok) usuariosData = usuariosRes.data;
  renderTablaRoles();
}

/** @returns {object[]} roles que cumplen los filtros de nombre/tipo. */
function rolesFiltrados() {
  const fNombre = (document.getElementById('filtroNombreRol').value || '').toLowerCase().trim();
  const fTipo = document.getElementById('filtroTipoRol').value;

  return rolesData.filter((rol) => {
    if (fNombre && !rol.nombre.toLowerCase().includes(fNombre)) return false;
    if (fTipo && rol.tipo !== fTipo) return false;
    return true;
  });
}

/** Pinta la tabla de roles aplicando los filtros. */
function renderTablaRoles() {
  const filtrados = rolesFiltrados();
  const tbody = document.getElementById('tablaRolesBody');
  tbody.innerHTML = '';

  document.getElementById('contadorRoles').textContent =
    `Mostrando ${filtrados.length} de ${rolesData.length} rol(es).`;

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No hay roles que coincidan con los filtros.</td></tr>';
    return;
  }

  filtrados.forEach(rol => {
    // El conteo se deriva de usuariosData porque listarUsuarios ya trae `roles`.
    const cantidad = usuariosData.filter((u) => (u.roles || []).some((r) => r.id === rol.id)).length;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${rol.id}</td>
      <td>${rol.nombre}</td>
      <td><span class="badge ${rol.tipo === 'SISTEMA' ? 'bg-danger' : 'bg-info'}">${rol.tipo}</span></td>
      <td>
        <button class="btn btn-sm btn-outline-secondary" onclick="verUsuariosDeRol(${rol.id})">
          <i class="bi bi-people"></i> ${cantidad} usuario(s)
        </button>
      </td>
      <td>
        ${hasPermission('CREAR_ROLES') ? `<button class="btn btn-sm btn-primary" onclick="editarRol(${rol.id})" title="Modificar" aria-label="Modificar"><i class="bi bi-pencil"></i></button>` : ''}
        ${hasPermission('CREAR_ROLES') ? `<button class="btn btn-sm btn-danger ms-1" onclick="eliminarRol(${rol.id})" title="Eliminar" aria-label="Eliminar"><i class="bi bi-trash"></i></button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.verUsuariosDeRol = async function (id) {
  rolUsuariosActual = rolesData.find((r) => r.id === id);
  if (!rolUsuariosActual) return;

  const tbody = document.getElementById('tablaUsuariosRolBody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Cargando...</td></tr>';
  document.getElementById('modalUsuariosRolTitle').textContent = `Usuarios del Rol: ${rolUsuariosActual.nombre}`;
  modalUsuariosRol.show();

  const res = await apiRequest(`/roles/${id}/usuarios`);
  if (!res.ok) {
    showToast(res.mensaje || 'No se pudieron obtener los usuarios del rol', 'error');
    tbody.innerHTML = '';
    return;
  }

  const usuarios = res.data || [];
  tbody.innerHTML = '';
  document.getElementById('usuariosRolVacio').style.display = usuarios.length === 0 ? 'block' : 'none';

  usuarios.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.usuario}</td>
      <td>${u.nombre} ${u.apellido}</td>
      <td>${u.email}</td>
      <td>
        ${hasPermission('ASIGNAR_ROLES') ? `<button class="btn btn-sm btn-outline-danger" onclick="quitarRolDeUsuario(${u.id}, ${id})" title="Quitar rol" aria-label="Quitar rol"><i class="bi bi-x-circle"></i></button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });

  await cargarDatos();
};

window.quitarRolDeUsuario = async function (usuarioId, rolId) {
  const res = await apiRequest(`/usuarios/${usuarioId}/roles/${rolId}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Rol quitado al usuario', 'success');
    await verUsuariosDeRol(rolId);
    await cargarDatos();
  } else {
    showToast(res.mensaje || 'Error al quitar rol', 'error');
  }
};

/** Abre el modal en modo "nuevo rol". */
function abrirModalNuevoRol() {
  document.getElementById('modalRolTitle').textContent = 'Nuevo Rol';
  document.getElementById('formRol').reset();
  document.getElementById('rolId').value = '';
  modalRol.show();
}

window.editarRol = function(id) {
  const rol = rolesData.find(r => r.id === id);
  if (!rol) return;
  document.getElementById('modalRolTitle').textContent = 'Modificar Rol';
  document.getElementById('rolId').value = rol.id;
  document.getElementById('nombreRol').value = rol.nombre;
  document.getElementById('tipoRol').value = rol.tipo;
  modalRol.show();
};

/** Guarda (crea o modifica) el rol del modal. */
async function guardarRol() {
  const id = document.getElementById('rolId').value;
  const data = {
    nombre: document.getElementById('nombreRol').value,
    tipo: document.getElementById('tipoRol').value,
  };
  let res;
  if (id) {
    res = await apiRequest(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  } else {
    res = await apiRequest('/roles', { method: 'POST', body: JSON.stringify(data) });
  }
  if (res.ok) {
    showToast(id ? 'Rol modificado' : 'Rol creado', 'success');
    modalRol.hide();
    await cargarDatos();
  } else {
    showToast(res.mensaje || 'Error al guardar rol', 'error');
  }
}

window.eliminarRol = async function(id) {
  // uiConfirmar() (js/ui.js) es el equivalente visual del confirm() nativo.
  if (!(await uiConfirmar('¿Eliminar este rol?'))) return;
  const res = await apiRequest(`/roles/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Rol eliminado', 'success');
    await cargarDatos();
  } else {
    showToast(res.mensaje || 'Error al eliminar', 'error');
  }
};

/** Abre el modal de asignación de rol a usuario. */
function abrirModalAsignarRol() {
  const selectUsuario = document.getElementById('selectUsuarioAsignar');
  selectUsuario.innerHTML = '<option value="">Seleccionar usuario...</option>';
  usuariosData.forEach(u => {
    selectUsuario.innerHTML += `<option value="${u.id}">${u.usuario} - ${u.nombre} ${u.apellido}</option>`;
  });
  const selectRol = document.getElementById('selectRolAsignar');
  selectRol.innerHTML = '<option value="">Seleccionar rol...</option>';
  rolesData.forEach(r => {
    selectRol.innerHTML += `<option value="${r.id}">${r.nombre} (${r.tipo})</option>`;
  });
  modalAsignarRolUsuario.show();
}

/** Asigna el rol elegido al usuario elegido. */
async function guardarAsignarRolUsuario() {
  const usuarioId = document.getElementById('selectUsuarioAsignar').value;
  const rolId = document.getElementById('selectRolAsignar').value;
  if (!usuarioId || !rolId) {
    showToast('Seleccione usuario y rol', 'warning');
    return;
  }
  const res = await apiRequest(`/usuarios/${usuarioId}/roles`, {
    method: 'POST',
    body: JSON.stringify({ rol_id: rolId }),
  });
  if (res.ok) {
    showToast('Rol asignado al usuario', 'success');
    modalAsignarRolUsuario.hide();
  } else {
    showToast(res.mensaje || 'Error al asignar rol', 'error');
  }
}
