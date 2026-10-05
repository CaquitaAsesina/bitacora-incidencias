/**
 * =====================================================================
 * js/usuarios.js — Gestión de usuarios (usuarios.html)
 * =====================================================================
 * Listado con filtros, alta/modificación en modal y borrado.
 * Los botones de fila llaman funciones globales (window.*).
 * Los permisos que gobiernan los botones se consultan con hasPermission().
 * =====================================================================
 */
let usuariosData = [];
let rolesData = []; // catálogo de roles para el filtro por rol
const modalUsuario = new bootstrap.Modal(document.getElementById('modalUsuario'));

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();

  if (hasPermission('CREAR_USUARIO')) {
    document.getElementById('btnNuevoUsuario').style.display = 'inline-block';
    document.getElementById('btnNuevoUsuario').addEventListener('click', abrirModalNuevo);
  }

  document.getElementById('btnGuardarUsuario').addEventListener('click', guardarUsuario);

  const idsFiltro = ['filtroDesde', 'filtroHasta', 'filtroUsuario', 'filtroNombre', 'filtroEmail', 'filtroTelefono'];
  idsFiltro.forEach((id) => {
    document.getElementById(id).addEventListener('input', renderTablaUsuarios);
  });
  document.getElementById('filtroRol').addEventListener('change', renderTablaUsuarios);
  document.getElementById('filtroHabilitado').addEventListener('change', renderTablaUsuarios);
  document.getElementById('btnFiltrarUsuarios').addEventListener('click', renderTablaUsuarios);
  document.getElementById('btnLimpiarFiltrosUsuarios').addEventListener('click', () => {
    idsFiltro.forEach((id) => (document.getElementById(id).value = ''));
    document.getElementById('filtroRol').value = '';
    document.getElementById('filtroHabilitado').value = '';
    renderTablaUsuarios();
  });

  await cargarDatos();
});

/** Carga roles (para el filtro) y usuarios. Rendimiento: ambas en paralelo. */
async function cargarDatos() {
  const [rolesRes, usuariosRes] = await Promise.all([
    apiRequest('/roles'),
    apiRequest('/usuarios'),
  ]);

  if (rolesRes.ok) {
    rolesData = rolesRes.data;
    const selectRol = document.getElementById('filtroRol');
    const seleccionActual = selectRol.value;
    selectRol.innerHTML = '<option value="">Todos los roles</option>';
    rolesData.forEach(r => {
      selectRol.innerHTML += `<option value="${r.id}">${r.nombre} (${r.tipo})</option>`;
    });
    selectRol.value = seleccionActual;
  }

  aplicarUsuarios(usuariosRes);
}

/** Carga y normaliza el listado de usuarios. */
async function cargarUsuarios() {
  aplicarUsuarios(await apiRequest('/usuarios'));
}

/** Aplica la respuesta de /usuarios a la tabla (normaliza el array de roles). */
function aplicarUsuarios(res) {
  if (res.ok) {
    // El endpoint ya incluye el array `roles` de cada usuario.
    usuariosData = res.data.map(u => ({
      ...u,
      roles: Array.isArray(u.roles) ? u.roles : [],
    }));
    renderTablaUsuarios();
  }
}

function formatFechaHora(valor) {
  if (!valor) return '-';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-ES');
}

/** Normaliza texto (minúsculas y sin acentos) para búsquedas. */
function normalizar(valor) {
  return (valor || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** @returns {object[]} usuarios que cumplen los filtros activos. */
function usuariosFiltrados() {
  // Rango de fechas: coincide si la creación o la última modificación del
  // usuario caen dentro de [desde, hasta].
  const fDesde = document.getElementById('filtroDesde').value;
  const fHasta = document.getElementById('filtroHasta').value;
  const fUsuario = normalizar(document.getElementById('filtroUsuario').value.trim());
  const fNombre = normalizar(document.getElementById('filtroNombre').value.trim());
  const fEmail = normalizar(document.getElementById('filtroEmail').value.trim());
  const fTelefono = normalizar(document.getElementById('filtroTelefono').value.trim());
  const fRol = document.getElementById('filtroRol').value;
  const fHabilitado = document.getElementById('filtroHabilitado').value;

  return usuariosData.filter((u) => {
    if (!fechaDentroDeRango(u.creado_en, fDesde, fHasta) && !fechaDentroDeRango(u.actualizado_en, fDesde, fHasta)) return false;
    if (fUsuario && !normalizar(u.usuario).includes(fUsuario)) return false;
    if (fNombre && !normalizar(`${u.nombre} ${u.apellido}`).includes(fNombre)) return false;
    if (fEmail && !normalizar(u.email).includes(fEmail)) return false;
    if (fTelefono && !normalizar(u.telefono).includes(fTelefono)) return false;
    if (fRol && !(u.roles || []).some((r) => r.id === parseInt(fRol, 10))) return false;
    if (fHabilitado !== '' && String(u.habilitado ? 1 : 0) !== fHabilitado) return false;
    return true;
  });
}

/** Pinta la tabla de usuarios aplicando los filtros. */
function renderTablaUsuarios() {
  const filtrados = usuariosFiltrados();
  const tbody = document.getElementById('tablaUsuariosBody');
  tbody.innerHTML = '';

  document.getElementById('contadorUsuarios').textContent =
    `Mostrando ${filtrados.length} de ${usuariosData.length} usuario(s).`;

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4">No hay usuarios que coincidan con los filtros.</td></tr>';
    return;
  }

  filtrados.forEach((usuario) => {
    const roles = usuario.roles || [];
    const rolesHtml = roles.length === 0
      ? '<span class="text-muted">Sin roles</span>'
      : roles.map(r => `
          <span class="badge ${r.tipo === 'SISTEMA' ? 'bg-danger' : 'bg-info'}">${r.nombre}</span>`).join(' ');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${usuario.id}</td>
      <td>${usuario.usuario}</td>
      <td>${usuario.nombre}</td>
      <td>${usuario.apellido}</td>
      <td>${usuario.email}</td>
      <td>${usuario.telefono || '-'}</td>
      <td>${usuario.habilitado ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-danger">No</span>'}</td>
      <td>${rolesHtml}</td>
      <td>${formatFechaHora(usuario.creado_en)}</td>
      <td>${formatFechaHora(usuario.actualizado_en)}</td>
      <td>
        ${hasPermission('CREAR_USUARIO') ? `<button class="btn btn-sm btn-warning ms-1" onclick="editarUsuario(${usuario.id})" title="Modificar" aria-label="Modificar"><i class="bi bi-pencil"></i></button>` : ''}
        ${hasPermission('CREAR_USUARIO') ? `<button class="btn btn-sm btn-danger ms-1" onclick="eliminarUsuario(${usuario.id})" title="Eliminar" aria-label="Eliminar"><i class="bi bi-trash"></i></button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/** Abre el modal en modo "nuevo usuario". */
function abrirModalNuevo() {
  editingUsuarioId = null;
  document.getElementById('modalUsuarioTitle').textContent = 'Nuevo Usuario';
  document.getElementById('formUsuario').reset();
  document.getElementById('passwordGroup').style.display = 'block';
  document.getElementById('contrasena').required = true;
  modalUsuario.show();
}

let editingUsuarioId = null;

window.editarUsuario = function(id) {
  const usuario = usuariosData.find(u => u.id === id);
  if (!usuario) return;
  editingUsuarioId = id;
  document.getElementById('modalUsuarioTitle').textContent = 'Modificar Usuario';
  document.getElementById('usuario').value = usuario.usuario;
  document.getElementById('nombre').value = usuario.nombre;
  document.getElementById('apellido').value = usuario.apellido;
  document.getElementById('email').value = usuario.email;
  document.getElementById('telefono').value = usuario.telefono || '';
  document.getElementById('habilitado').value = usuario.habilitado ? 'true' : 'false';
  document.getElementById('passwordGroup').style.display = 'none';
  document.getElementById('contrasena').required = false;
  document.getElementById('contrasena').value = '';
  modalUsuario.show();
};

/** Guarda (crea o modifica) el usuario del modal. */
async function guardarUsuario() {
  const data = {
    usuario: document.getElementById('usuario').value,
    nombre: document.getElementById('nombre').value,
    apellido: document.getElementById('apellido').value,
    email: document.getElementById('email').value,
    telefono: document.getElementById('telefono').value || null,
    habilitado: document.getElementById('habilitado').value === 'true',
  };
  if (document.getElementById('contrasena').value) {
    data.contrasena = document.getElementById('contrasena').value;
  }
  let res;
  if (editingUsuarioId) {
    res = await apiRequest(`/usuarios/${editingUsuarioId}`, { method: 'PATCH', body: JSON.stringify(data) });
  } else {
    res = await apiRequest('/usuarios', { method: 'POST', body: JSON.stringify(data) });
  }
  if (res.ok) {
    showToast(editingUsuarioId ? 'Usuario modificado' : 'Usuario creado', 'success');
    modalUsuario.hide();
    await cargarUsuarios();
  } else {
    showToast(res.mensaje || 'Error al guardar usuario', 'error');
  }
}

window.eliminarUsuario = async function(id) {
  // uiConfirmar() (js/ui.js) es el equivalente visual del confirm() nativo:
  // mismo flujo, misma decisión, pero con modal Bootstrap.
  if (!(await uiConfirmar('¿Eliminar este usuario?'))) return;
  const res = await apiRequest(`/usuarios/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Usuario eliminado', 'success');
    await cargarUsuarios();
  } else {
    showToast(res.mensaje || 'Error al eliminar', 'error');
  }
};
