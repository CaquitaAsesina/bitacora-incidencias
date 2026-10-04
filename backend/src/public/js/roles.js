document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  const res = await apiRequest('/roles');
  if (res.ok) {
    const tbody = document.getElementById('tablaRolesBody');
    tbody.innerHTML = res.data.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.nombre}</td>
        <td><span class="badge ${r.tipo === 'SISTEMA' ? 'bg-danger' : 'bg-info'}">${r.tipo}</span></td>
      </tr>
    `).join('');
  }
});
