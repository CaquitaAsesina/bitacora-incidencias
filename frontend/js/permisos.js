/**
 * =====================================================================
 * js/permisos.js — Catálogo de permisos y su asignación (permisos.html)
 * =====================================================================
 * CRUD de permisos + asignación de permisos a roles SISTEMA (Lógica A) y a
 * usuarios con rol PERSONALIZADO (Lógica B).
 *
 * La tabla se filtra por nombre y por rango de fechas (creación/modificación),
 * en vivo, sin recargar. Los modales generan checkboxes
 * dinámicos de todos los permisos disponibles.
 *
 * ALINEADO CON EL BACKEND (permisosService.js):
 *   - Renombrar exige MODIFICAR_PERMISOS y borrar ELIMINAR_PERMISOS. Antes ambos
 *     botones usaban CREAR_PERMISOS, que solo corresponde al alta.
 *   - Cada fila trae su auditoría y los conteos de uso (roles que lo tienen,
 *     usuarios con concedido / denegado).
 *   - /roles y /usuarios solo se piden si hacen falta para los modales de
 *     asignación, que exigen ASIGNAR_PERMISOS.
 *
 * Para extender: reutiliza filaPermisoAsignado() para chips de permisos
 * concedidos y los contenedores .perm-rol-check / .perm-usu-check.
 * =====================================================================
 */
let permisosData = [];
let rolesData = [];
let usuariosData = [];
let filtroNombreActual = '';
const modalPermiso = new bootstrap.Modal(document.getElementById('modalPermiso'));
const modalAsignarPermisosRol = new bootstrap.Modal(document.getElementById('modalAsignarPermisosRol'));
const modalAsignarPermisosUsuario = new bootstrap.Modal(document.getElementById('modalAsignarPermisosUsuario'));

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();

  if (hasPermission('CREAR_PERMISOS')) {
    document.getElementById('btnNuevoPermiso').style.display = 'inline-block';
    document.getElementById('btnNuevoPermiso').addEventListener('click', abrirModalNuevoPermiso);
    document.getElementById('btnGuardarPermiso').addEventListener('click', guardarPermiso);
  }

  if (hasPermission(PERMISOS.USUARIOS.ASIGNAR_PERMISOS)) {
    document.getElementById('btnAsignarPermisosRol').style.display = 'inline-block';
    document.getElementById('btnAsignarPermisosUsuario').style.display = 'inline-block';
    document.getElementById('btnAsignarPermisosRol').addEventListener('click', abrirAsignarPermisosRol);
    document.getElementById('btnAsignarPermisosUsuario').addEventListener('click', abrirAsignarPermisosUsuario);
    document.getElementById('btnGuardarAsignacionRol').addEventListener('click', guardarAsignacionPermisosRol);
    document.getElementById('btnGuardarAsignacionUsuario').addEventListener('click', guardarAsignacionPermisosUsuario);
  }

  document.getElementById('btnFiltrar').addEventListener('click', () => {
    filtroNombreActual = document.getElementById('filtroNombre').value;
    renderTablaPermisos();
  });

  document.getElementById('btnLimpiar').addEventListener('click', () => {
    document.getElementById('filtroNombre').value = '';
    document.getElementById('filtroDesde').value = '';
    document.getElementById('filtroHasta').value = '';
    filtroNombreActual = '';
    renderTablaPermisos();
  });

  // Filtrado en vivo: nombre y rango de fechas, sin recargar la tabla.
  document.getElementById('filtroNombre').addEventListener('input', () => {
    filtroNombreActual = document.getElementById('filtroNombre').value;
    renderTablaPermisos();
  });
  document.getElementById('filtroDesde').addEventListener('input', renderTablaPermisos);
  document.getElementById('filtroHasta').addEventListener('input', renderTablaPermisos);

  document.getElementById('filtroNombre').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btnFiltrar').click();
    }
  });

  await cargarDatos();
});

/**
 * Carga el catálogo de permisos y, si la sesión puede asignarlos, los catálogos
 * de roles y usuarios que alimentan los dos modales de asignación.
 *
 * Pedir /roles o /usuarios sin permiso no es un error, pero devuelve 403 y
 * solo añade ruido: se evitan esas peticiones.
 */
async function cargarDatos() {
  const puedeAsignar = hasPermission(PERMISOS.USUARIOS.ASIGNAR_PERMISOS);

  const [permisosRes, rolesRes, usuariosRes] = await Promise.all([
    apiRequest('/permisos'),
    puedeAsignar ? apiRequest('/roles') : Promise.resolve({ ok: false }),
    puedeAsignar ? apiRequest('/usuarios') : Promise.resolve({ ok: false }),
  ]);

  if (permisosRes.ok) permisosData = permisosRes.data;
  if (rolesRes.ok) rolesData = rolesRes.data;
  if (usuariosRes.ok) usuariosData = usuariosRes.data;
  renderTablaPermisos();
}

/** Pinta la tabla de permisos aplicando el filtro por nombre. */
function renderTablaPermisos() {
  const tbody = document.getElementById('tablaPermisosBody');
  tbody.innerHTML = '';

  // Rango de fechas: coincide si la creación o la última modificación del
  // permiso caen dentro de [desde, hasta].
  const fDesde = document.getElementById('filtroDesde').value;
  const fHasta = document.getElementById('filtroHasta').value;
  const filtro = filtroNombreActual.trim().toLowerCase();

  const permisosFiltrados = permisosData.filter((p) => {
    if (filtro && !p.nombre.toLowerCase().includes(filtro)) return false;
    if (!fechaDentroDeRango(p.creado_en, fDesde, fHasta) && !fechaDentroDeRango(p.actualizado_en, fDesde, fHasta)) return false;
    return true;
  });

  if (permisosFiltrados.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center text-muted py-4">No hay permisos que coincidan con la búsqueda</td></tr>';
    return;
  }

  const puedeModificar = hasPermission(PERMISOS.PERMISOS.MODIFICAR);
  const puedeEliminar = hasPermission(PERMISOS.PERMISOS.ELIMINAR);

  permisosFiltrados.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.id}</td>
      <td><code>${escaparHtml(p.nombre)}</code></td>
      <td class="text-center">
        <span class="badge bg-light text-dark" title="Roles SISTEMA que lo tienen en su plantilla (Lógica A)">${p.total_roles ?? 0}</span>
      </td>
      <td class="text-center">
        <span class="badge bg-success" title="Usuarios con el permiso concedido (Lógica B)">${p.usuarios_concedidos ?? 0}</span>
        <span class="badge bg-secondary" title="Usuarios con el permiso denegado explícitamente (Lógica B)">${p.usuarios_denegados ?? 0}</span>
      </td>
      <td>${autorLegible(p.creado_por_usuario)}</td>
      <td>${autorLegible(p.actualizado_por_usuario)}</td>
      <td>${celdaFecha(p.creado_en)}</td>
      <td>${celdaFecha(p.actualizado_en)}</td>
      <td class="text-nowrap">
      <div class="d-inline-flex flex-nowrap gap-1">
      ${puedeModificar ? `<button class="btn btn-sm btn-warning ms-1" onclick="editarPermiso(${p.id})" title="Modificar" aria-label="Modificar ${escaparHtml(p.nombre)}"><i class="bi bi-pencil"></i></button>` : ''}
        ${puedeEliminar ? `<button class="btn btn-sm btn-danger ms-1" onclick="eliminarPermiso(${p.id})" title="Eliminar" aria-label="Eliminar ${escaparHtml(p.nombre)}"><i class="bi bi-trash"></i></button>` : ''}
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

/** Nombre legible del autor de auditoría, con el usuario como respaldo. */
function autorLegible(usuario) {
  if (!usuario) return '<span class="text-muted">—</span>';
  return escaparHtml(usuario);
}

/** Abre el modal en modo "nuevo permiso". */
function abrirModalNuevoPermiso() {
  document.getElementById('modalPermisoTitle').textContent = 'Nuevo Permiso';
  document.getElementById('formPermiso').reset();
  document.getElementById('permisoId').value = '';
  modalPermiso.show();
}

window.editarPermiso = function (id) {
  const permiso = permisosData.find((p) => p.id === id);
  if (!permiso) return;
  document.getElementById('modalPermisoTitle').textContent = 'Modificar Permiso';
  document.getElementById('permisoId').value = permiso.id;
  document.getElementById('nombrePermiso').value = permiso.nombre;
  modalPermiso.show();
};

window.eliminarPermiso = async function (id) {
  const permiso = permisosData.find((p) => p.id === id);
  const nombre = permiso ? permiso.nombre : id;
  // uiConfirmar() (js/ui.js) es el equivalente visual del confirm() nativo.
  const confirmado = await uiConfirmar(
    `¿Eliminar el permiso "${nombre}"? Se quitará de todos los roles y usuarios que lo tengan asignado.`
  );
  if (!confirmado) return;

  const res = await apiRequest(`/permisos/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Permiso eliminado', 'success');
    await cargarDatos();
  } else {
    showToast(res.mensaje || 'Error al eliminar el permiso', 'error');
  }
};

/** Guarda (crea o modifica) el permiso del modal. */
async function guardarPermiso() {
  const id = document.getElementById('permisoId').value;
  const nombre = document.getElementById('nombrePermiso').value.trim();
  if (!nombre) return;

  let res;
  if (id) {
    res = await apiRequest(`/permisos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ nombre }),
    });
  } else {
    res = await apiRequest('/permisos', {
      method: 'POST',
      body: JSON.stringify({ nombre }),
    });
  }

  if (res.ok) {
    showToast(id ? 'Permiso modificado' : 'Permiso creado', 'success');
    modalPermiso.hide();
    document.getElementById('formPermiso').reset();
    await cargarDatos();
  } else {
    const detalle = Array.isArray(res.errors) ? `: ${res.errors.map((e) => e.msg).join(' ')}` : '';
    showToast((res.mensaje || 'Error al guardar permiso') + detalle, 'error');
  }
}

/** Abre el modal de asignación de permisos a un rol SISTEMA. */
function abrirAsignarPermisosRol() {
  const selectRol = document.getElementById('selectRolSistema');
  selectRol.innerHTML = '<option value="">Seleccionar rol SISTEMA...</option>';
  rolesData.forEach(r => {
    if (r.tipo === 'SISTEMA') {
      selectRol.innerHTML += `<option value="${r.id}">${escaparHtml(r.nombre)}</option>`;
    }
  });
  const container = document.getElementById('permisosRolContainer');
  container.innerHTML = '';
  permisosData.forEach(p => {
    const div = document.createElement('div');
    div.className = 'form-check';
    div.innerHTML = `
      <input class="form-check-input perm-rol-check" type="checkbox" value="${p.id}" id="pr_${p.id}">
      <label class="form-check-label" for="pr_${p.id}">${escaparHtml(p.nombre)}</label>
    `;
    container.appendChild(div);
  });

  document.getElementById('permisosRolAsignados').innerHTML = '';
  document.getElementById('selectRolSistema').onchange = () => cargarAsignadosRolSistema();
  modalAsignarPermisosRol.show();
}

/** Carga y marca los permisos ya asignados al rol SISTEMA seleccionado. */
async function cargarAsignadosRolSistema() {
  const rolId = document.getElementById('selectRolSistema').value;
  const chips = document.getElementById('permisosRolAsignados');
  const checks = document.querySelectorAll('.perm-rol-check');
  checks.forEach(cb => (cb.checked = false));
  chips.innerHTML = '<span class="text-muted">Seleccione un rol...</span>';

  if (!rolId) return;

  chips.innerHTML = '<span class="text-muted">Cargando...</span>';
  const res = await apiRequest(`/roles/${rolId}/permisos`);
  if (!res.ok) {
    chips.innerHTML = `<span class="text-danger">${res.mensaje || 'Error al cargar permisos del rol'}</span>`;
    return;
  }

  const asignados = res.data || [];
  if (asignados.length === 0) {
    chips.innerHTML = '<span class="text-muted">Este rol no tiene permisos asignados.</span>';
    return;
  }

  const porId = new Set(asignados.map(p => p.id));
  checks.forEach(cb => {
    cb.checked = porId.has(parseInt(cb.value, 10));
  });

  chips.innerHTML = '';
  asignados.forEach((p) => {
    chips.appendChild(
      filaPermisoAsignado(p.nombre, `quitarPermisoDeRolSistema(${Number(rolId)}, ${Number(p.id)})`)
    );
  });
}

window.quitarPermisoDeRolSistema = async function (rolId, permisoId) {
  const res = await apiRequest(`/roles/${rolId}/permisos/${permisoId}`, { method: 'DELETE' });
  if (res.ok) {
    const nombre = permisosData.find((p) => p.id === Number(permisoId))?.nombre ?? permisoId;
    showToast(`Permiso ${nombre} quitado del rol`, 'success');
    await cargarAsignadosRolSistema();
  } else {
    showToast(res.mensaje || 'Error al quitar permiso del rol', 'error');
  }
};

/** Reemplaza los permisos del rol SISTEMA con los checkboxes marcados. */
async function guardarAsignacionPermisosRol() {
  const rolId = document.getElementById('selectRolSistema').value;
  if (!rolId) {
    showToast('Seleccione un rol SISTEMA', 'warning');
    return;
  }
  const checkboxes = document.querySelectorAll('.perm-rol-check:checked');
  const permisos = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const res = await apiRequest(`/roles/${rolId}/permisos`, {
    method: 'POST',
    body: JSON.stringify({ permisos }),
  });
  if (res.ok) {
    showToast('Permisos asignados al rol', 'success');
    modalAsignarPermisosRol.hide();
  } else {
    showToast(res.mensaje || 'Error al asignar permisos', 'error');
  }
}

/** Abre el modal de permisos por usuario (Lógica B). */
async function abrirAsignarPermisosUsuario() {
  const selectUsuario = document.getElementById('selectUsuarioPerm');
  selectUsuario.innerHTML = '<option value="">Seleccionar usuario...</option>';
  usuariosData.forEach(u => {
    const roles = (u.roles || []).map(r => r.nombre).join(', ') || 'sin roles';
    selectUsuario.innerHTML += `<option value="${u.id}">${escaparHtml(`${u.usuario} - ${u.nombre} ${u.apellido} [${roles}]`)}</option>`;
  });

  selectUsuario.onchange = () => cargarRolPersonalizadoDelUsuario();

  const container = document.getElementById('permisosUsuarioContainer');
  container.innerHTML = '';
  permisosData.forEach(p => {
    const div = document.createElement('div');
    div.className = 'form-check';
    div.innerHTML = `
      <input class="form-check-input perm-usu-check" type="checkbox" value="${p.id}" id="pu_${p.id}">
      <label class="form-check-label" for="pu_${p.id}">${escaparHtml(p.nombre)}</label>
    `;
    container.appendChild(div);
  });

  limpiarPermisosUsuario();
  modalAsignarPermisosUsuario.show();
}

/** Reinicia el estado del modal de permisos por usuario. */
function limpiarPermisosUsuario() {
  document.querySelectorAll('.perm-usu-check').forEach(cb => (cb.checked = false));
  const chips = document.getElementById('permisosUsuarioAsignados');
  if (chips) chips.innerHTML = '';
  document.getElementById('rolPersonalizadoResuelto').value = '';
  const btn = document.getElementById('btnGuardarAsignacionUsuario');
  if (btn) btn.disabled = true;
}

/** Resuelve el rol PERSONALIZADO del usuario y muestra sus permisos. */
async function cargarRolPersonalizadoDelUsuario() {
  const usuarioId = document.getElementById('selectUsuarioPerm').value;
  const campoRol = document.getElementById('rolPersonalizadoResuelto');
  const chips = document.getElementById('permisosUsuarioAsignados');
  const btn = document.getElementById('btnGuardarAsignacionUsuario');

  limpiarPermisosUsuario();

  if (!usuarioId) return;

  campoRol.value = 'Buscando rol PERSONALIZADO...';
  chips.innerHTML = '<span class="text-muted">Cargando...</span>';

  const res = await apiRequest(`/usuarios/${usuarioId}/permisos-personalizados`);

  if (!res.ok) {
    campoRol.value = '';
    campoRol.classList.add('is-invalid');
    btn.disabled = true;
    chips.innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-triangle"></i> ${res.mensaje}</span>`;
    showToast(res.mensaje || 'El usuario no tiene un rol PERSONALIZADO válido', 'error');
    return;
  }

  const { rol, permisos } = res.data;
  campoRol.classList.remove('is-invalid');
  campoRol.value = `${rol.nombre} (${rol.tipo})`;
  btn.disabled = false;

  if (!permisos || permisos.length === 0) {
    chips.innerHTML = '<span class="text-muted">Este usuario no tiene permisos asignados. Marque los que quiera agregar.</span>';
    return;
  }

  const porId = new Set(permisos.map(p => p.id));
  document.querySelectorAll('.perm-usu-check').forEach(cb => {
    cb.checked = porId.has(parseInt(cb.value, 10));
  });

  chips.innerHTML = '';
  permisos.forEach((p) => {
    chips.appendChild(
      filaPermisoAsignado(p.nombre, `quitarPermisoDeUsuario(${Number(usuarioId)}, ${Number(p.id)})`)
    );
  });
}

/** Crea el chip de un permiso concedido con su botón de quitar. */
function filaPermisoAsignado(nombre, onclickQuitar) {
  const div = document.createElement('div');
  div.className = 'd-flex justify-content-between align-items-center border rounded px-2 py-1 bg-success bg-opacity-10';
  div.style.minWidth = '260px';
  // `nombre` va escapado y `onclickQuitar` solo lleva ids numéricos: un nombre
  // con comillas no puede romper el onclick ni inyectar atributos.
  div.innerHTML = `
    <span>${escaparHtml(nombre)}</span>
    <button type="button" class="btn btn-sm btn-outline-danger" title="Quitar" aria-label="Quitar ${escaparHtml(nombre)}" onclick="${onclickQuitar}">
      <i class="bi bi-x-circle"></i>
    </button>`;
  return div;
}

window.quitarPermisoDeUsuario = async function (usuarioId, permisoId) {
  const res = await apiRequest(`/usuarios/${usuarioId}/permisos-personalizados/${permisoId}`, { method: 'DELETE' });
  if (res.ok) {
    const nombre = permisosData.find((p) => p.id === Number(permisoId))?.nombre ?? permisoId;
    showToast(`Permiso ${nombre} quitado al usuario`, 'success');
    await cargarRolPersonalizadoDelUsuario();
  } else {
    showToast(res.mensaje || 'Error al quitar permiso', 'error');
  }
};

/** Guarda los permisos marcados para el usuario seleccionado. */
async function guardarAsignacionPermisosUsuario() {
  const usuarioId = document.getElementById('selectUsuarioPerm').value;
  if (!usuarioId) {
    showToast('Seleccione un usuario', 'warning');
    return;
  }

  const checkboxes = document.querySelectorAll('.perm-usu-check:checked');
  const permisos = Array.from(checkboxes).map(cb => ({
    permiso_id: parseInt(cb.value, 10),
    concedido: true,
  }));

  const res = await apiRequest(`/usuarios/${usuarioId}/permisos-personalizados`, {
    method: 'POST',
    body: JSON.stringify({ permisos }),
  });

  if (res.ok) {
    showToast(res.mensaje || 'Permisos asignados al usuario', 'success');
    modalAsignarPermisosUsuario.hide();
  } else {
    showToast(res.mensaje || 'Error al asignar permisos', 'error');
  }
}
