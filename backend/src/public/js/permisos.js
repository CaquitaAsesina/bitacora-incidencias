document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  const res = await apiRequest('/permisos');
  if (res.ok) {
    const tbody = document.getElementById('tablaPermisosBody');
    tbody.innerHTML = res.data.map(p => `
      <tr>
        <td>${p.id}</td>
        <td>${p.nombre}</td>
      </tr>
    `).join('');
  }
});
