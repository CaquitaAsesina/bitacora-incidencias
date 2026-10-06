/**
 * =====================================================================
 * js/roles.js — Gestión de roles (roles.html)
 * =====================================================================
 * CRUD de roles, asignación de un rol a un usuario y listado de usuarios de
 * un rol.
 *
 * ALINEADO CON EL BACKEND (rolesService.js):
 *   - Editar exige MODIFICAR_ROLES y borrar ELIMINAR_ROLES. Antes ambos
 *     botones usaban CREAR_ROLES, así que con ese permiso no se podía borrar
 *     y sin él no aparecía ninguno de los dos.
 *   - El filtro de `tipo` va al servidor (idx_roles_tipo). El de nombre y el
 *     rango de fechas se resuelven en el navegador: son catálogos pequeños y
 *     así el filtrado es inmediato sin recargar.
 *   - El conteo de usuarios sale de `total_usuarios` del propio rol, no de
 *     contar sobre el listado de usuarios. Antes la página pedía /usuarios
 *     (que exige VER_USUARIOS) solo para contar: un usuario con VER_ROLES pero
 *     sin VER_USUARIOS veía el conteo en 0 aunque tuviera usuarios.
 * =====================================================================
 */
let rolesData = [];
let usuariosData = []; // solo para el desplegable de "asignar rol a usuario"
let filtroTipoServidor = '';

const modalRol = new bootstrap.Modal(document.getElementById('modalRol'));
const modalAsignarRolUsuario = new bootstrap.Modal(document.getElementById('modalAsignarRolUsuario'));
const modalUsuariosRol = new bootstrap.Modal(document.getElementById('modalUsuariosRol'));

document.addEventListener('DOMContentLoaded', async () => {
  const userData = await checkAuth();
  if (!userData) return;

  if (hasPermission(PERMISOS.ROLES.CREAR)) {
    document.getElementById('btnNuevoRol').style.display = 'inline-block';
    document.getElementById('btnNuevoRol').addEventListener('click', abrirModalNuevoRol);
  }
  document.getElementById('btnGuardarRol').addEventListener('click', guardarRol);

  if (hasPermission(PERMISOS.USUARIOS.ASIGNAR_ROLES)) {
    document.getElementById('btnAsignarRolUsuario').style.display = 'inline-block';
    document.getElementById('btnAsignarRolUsuario').addEventListener('click', abrirModalAsignarRol);
    document.getElementById('btnGuardarAsignarRolUsuario').addEventListener('click', guardarAsignarRolUsuario);
  }

  // El tipo se resuelve en el servidor; el nombre y las fechas, en el cliente.
  document.getElementById('filtroTipoRol').addEventListener('change', async (e) => {
    filtroTipoServidor = e.target.value;
    await cargarRoles();
  });
  ['filtroNombreRol', 'filtroDesde', 'filtroHasta'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderTablaRoles);
  });

  document.getElementById('btnFiltrarRoles').addEventListener('click', cargarRoles);
  document.getElementById('btnLimpiarFiltrosRoles').addEventListener('click', async () => {
    document.getElementById('filtroNombreRol').value = '';
    document.getElementById('filtroTipoRol').value = '';
    document.getElementById('filtroDesde').value = '';
    document.getElementById('filtroHasta').value = '';
    filtroTipoServidor = '';
    await cargarRoles();
  });

  await cargarRoles();

  // Solo hace falta para el desplegable del modal de asignación. Usa
  // /usuarios/lista (ASIGNAR_ROLES) y no /usuarios (VER_USUARIOS): quien
  // asigna roles no tiene por qué poder ver el directorio completo.
  if (hasPermission(PERMISOS.USUARIOS.ASIGNAR_ROLES)) {
    const res = await apiRequest('/usuarios/lista');
    if (res.ok) {
      usuariosData = res.data;
    } else {
      showToast(res.mensaje || 'No se pudo cargar el listado de usuarios', 'error');
    }
  }
});

/** Carga el catálogo de roles respetando el filtro de tipo del servidor. */
async function cargarRoles() {
  const res = await apiRequest(`/roles${filtroTipoServidor ? `?tipo=${encodeURIComponent(filtroTipoServidor)}` : ''}`);

  if (!res.ok) {
    document.getElementById('tablaRolesBody').innerHTML =
      '<tr><td colspan="10" class="text-center text-danger py-4">No se pudo cargar el catálogo de roles.</td></tr>';
    return;
  }

  rolesData = res.data;
  renderTablaRoles();
}

/** Normaliza texto (minúsculas y sin acentos) para búsquedas. */
function normalizarTexto(valor) {
  return (valor || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Nombre legible del autor de auditoría, con el usuario como respaldo. */
function autorLegible(usuario) {
  if (!usuario) return '<span class="text-muted">—</span>';
  return escaparHtml(usuario);
}

/** @returns {object[]} roles que cumplen los filtros de nombre y fecha. */
function rolesFiltrados() {
  const fDesde = document.getElementById('filtroDesde').value;
  const fHasta = document.getElementById('filtroHasta').value;
  const fNombre = normalizarTexto(document.getElementById('filtroNombreRol').value.trim());

  return rolesData.filter((rol) => {
    // Rango de fechas: coincide si la creación o la última modificación del rol
    // caen dentro de [desde, hasta].
    if (
      !fechaDentroDeRango(rol.creado_en, fDesde, fHasta) &&
      !fechaDentroDeRango(rol.actualizado_en, fDesde, fHasta)
    ) {
      return false;
    }
    if (fNombre && !normalizarTexto(rol.nombre).includes(fNombre)) return false;
    return true;
  });
}

/** Pinta la tabla de roles aplicando los filtros. */
function renderTablaRoles() {
  const filtrados = rolesFiltrados();
  const tbody = document.getElementById('tablaRolesBody');
  tbody.innerHTML = '';

  if (filtrados.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="10" class="text-center text-muted py-4">No hay roles que coincidan con los filtros.</td></tr>';
    return;
  }

  const puedeEditar = hasPermission(PERMISOS.ROLES.MODIFICAR);
  const puedeEliminar = hasPermission(PERMISOS.ROLES.ELIMINAR);

  filtrados.forEach((rol) => {
    const esSistema = rol.tipo === 'SISTEMA';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${rol.id}</td>
      <td>${escaparHtml(rol.nombre)}</td>
      <td>
        <span class="badge ${esSistema ? 'bg-danger' : 'bg-info'}" title="${esSistema
        ? 'Lógica A: la plantilla de permisos del rol aplica a todos sus usuarios'
        : 'Lógica B: cada usuario del rol puede tener permisos propios'
      }">${escaparHtml(rol.tipo)}</span>
      </td>
      <td class="text-center">
        <span class="badge bg-light text-dark" title="Usuarios con este rol">${rol.total_usuarios ?? 0}</span>
      </td>
      <td class="text-center">
        <span class="badge bg-light text-dark" title="Permisos en la plantilla (Lógica A)">${rol.total_permisos ?? 0}</span>
      </td>
      <td>${autorLegible(rol.creado_por_usuario)}</td>
      <td>${autorLegible(rol.actualizado_por_usuario)}</td>
      <td>${celdaFecha(rol.creado_en)}</td>
      <td>${celdaFecha(rol.actualizado_en)}</td>

      <td class="text-nowrap>
      <div class="d-inline-flex flex-nowrap gap-1">
        <button class="btn btn-sm btn-outline-secondary" onclick="verUsuariosDeRol(${rol.id})" title="Ver usuarios con este rol" aria-label="Ver usuarios del rol ${escaparHtml(rol.nombre)}">
          <i class="bi bi-people"></i>
        </button>
        ${puedeEditar ? `<button class="btn btn-sm btn-warning ms-1" onclick="editarRol(${rol.id})" title="Modificar" aria-label="Modificar rol ${escaparHtml(rol.nombre)}"><i class="bi bi-pencil"></i></button>` : ''}
        ${puedeEliminar ? `<button class="btn btn-sm btn-danger ms-1" onclick="eliminarRol(${rol.id})" title="Eliminar" aria-label="Eliminar rol ${escaparHtml(rol.nombre)}"><i class="bi bi-trash"></i></button>` : ''}
          </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
function celdaFecha(valor) {
  const texto = formatearFechaHora(valor).replace(',', '');
  return `<span style="color: #4caf50; font-weight: 350; font-size: 0.85xem;">${escaparHtml(texto)}</span>`;
}
window.verUsuariosDeRol = async function (id) {
  const rol = rolesData.find((r) => r.id === id);
  if (!rol) return;

  const tbody = document.getElementById('tablaUsuariosRolBody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Cargando...</td></tr>';
  document.getElementById('modalUsuariosRolTitle').textContent = `Usuarios del Rol: ${rol.nombre}`;
  document.getElementById('usuariosRolVacio').style.display = 'none';
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

  const puedeQuitar = hasPermission(PERMISOS.USUARIOS.ASIGNAR_ROLES);

  usuarios.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${escaparHtml(u.usuario)}</td>
      <td>${escaparHtml(`${u.nombre} ${u.apellido}`)}</td>
      <td>${escaparHtml(u.email || '—')}</td>
      <td>
        ${puedeQuitar ? `<button class="btn btn-sm btn-outline-danger" onclick="quitarRolDeUsuario(${u.id}, ${id})" title="Quitar rol" aria-label="Quitar rol a ${escaparHtml(u.usuario)}"><i class="bi bi-x-circle"></i></button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
};

window.quitarRolDeUsuario = async function (usuarioId, rolId) {
  const res = await apiRequest(`/usuarios/${usuarioId}/roles/${rolId}`, { method: 'DELETE' });

  if (!res.ok) {
    showToast(res.mensaje || 'Error al quitar rol', 'error');
    return;
  }

  showToast('Rol quitado al usuario', 'success');

  // Repinta el modal con la lista ya actualizada y refleja el nuevo conteo sin
  // recargar el catálogo entero de roles.
  const rol = rolesData.find((r) => r.id === rolId);
  if (rol) rol.total_usuarios = Math.max((rol.total_usuarios ?? 0) - 1, 0);
  renderTablaRoles();

  await verUsuariosDeRol(rolId);
};

/** Abre el modal en modo "nuevo rol". */
function abrirModalNuevoRol() {
  document.getElementById('modalRolTitle').textContent = 'Nuevo Rol';
  document.getElementById('formRol').reset();
  document.getElementById('rolId').value = '';
  modalRol.show();
}

window.editarRol = function (id) {
  const rol = rolesData.find((r) => r.id === id);
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
  const btn = document.getElementById('btnGuardarRol');
  const data = {
    nombre: document.getElementById('nombreRol').value.trim(),
    tipo: document.getElementById('tipoRol').value,
  };

  if (!data.nombre) {
    showToast('El nombre del rol es obligatorio', 'error');
    return;
  }

  btn.disabled = true;
  try {
    const res = id
      ? await apiRequest(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
      : await apiRequest('/roles', { method: 'POST', body: JSON.stringify(data) });

    if (!res.ok) {
      const detalle = Array.isArray(res.errors) ? `: ${res.errors.map((e) => e.msg).join(' ')}` : '';
      showToast((res.mensaje || 'Error al guardar rol') + detalle, 'error');
      return;
    }

    showToast(id ? 'Rol modificado' : 'Rol creado', 'success');
    modalRol.hide();
    await cargarRoles();
  } finally {
    btn.disabled = false;
  }
}

window.eliminarRol = async function (id) {
  const rol = rolesData.find((r) => r.id === id);
  const conUsuarios = (rol?.total_usuarios ?? 0) > 0;

  // La tabla usuarios_roles borra en cascada, pero quitar el rol a un usuario
  // pierde su configuración: conviene avisar antes de seguir.
  const mensaje = conUsuarios
    ? `“${rol.nombre}” lo tienen ${rol.total_usuarios} usuario(s). Si lo eliminas, se les quitará el rol y sus permisos asociados.`
    : `¿Eliminar el rol “${rol?.nombre || id}”?`;

  // uiConfirmar() (js/ui.js) es el equivalente visual del confirm() nativo.
  if (!(await uiConfirmar(mensaje))) return;

  const res = await apiRequest(`/roles/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Rol eliminado', 'success');
    await cargarRoles();
  } else {
    showToast(res.mensaje || 'Error al eliminar', 'error');
  }
};

/** Abre el modal de asignación de rol a usuario. */
function abrirModalAsignarRol() {
  const selectUsuario = document.getElementById('selectUsuarioAsignar');
  selectUsuario.innerHTML = '<option value="">Seleccionar usuario...</option>';
  usuariosData.forEach((u) => {
    selectUsuario.innerHTML += `<option value="${u.id}">${escaparHtml(`${u.usuario} - ${u.nombre} ${u.apellido}`)}</option>`;
  });

  const selectRol = document.getElementById('selectRolAsignar');
  selectRol.innerHTML = '<option value="">Seleccionar rol...</option>';
  rolesData.forEach((r) => {
    selectRol.innerHTML += `<option value="${r.id}">${escaparHtml(r.nombre)} (${r.tipo})</option>`;
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

    // Refleja el cambio en el conteo sin volver a pedir el catálogo.
    const rol = rolesData.find((r) => r.id === Number(rolId));
    if (rol) rol.total_usuarios = (rol.total_usuarios ?? 0) + 1;
    renderTablaRoles();
  } else {
    showToast(res.mensaje || 'Error al asignar rol', 'error');
  }
}