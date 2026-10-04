/**
 * =====================================================================
 * js/ui.js — Control visual (Bootstrap 5): overlays, confirmaciones y
 * componentes. NO contiene lógica de negocio.
 * =====================================================================
 * Responsabilidades:
 *   - Pantallas de carga: boot (al abrir), login (verde) y logout (rojo).
 *   - Confirmaciones: uiConfirmar() muestra el modal #uiModalConfirmacion y
 *     resuelve true/false, igual que window.confirm() pero no bloqueante.
 *   - Menú lateral en móvil: replica #sidebarNav en un offcanvas.
 *   - Inicializa tooltips/popovers y el auto-cierre de alertas.
 *
 * Se carga con defer y DESPUÉS de api.js / layout.js. El envoltorio de
 * apiRequest se instala al interpretar el script (aún no se ha lanzado
 * ninguna petición) y el resto en DOMContentLoaded.
 *
 * Revertir: eliminar el <script> de este archivo y los bloques
 * .ui-overlay / #uiModalConfirmacion del HTML; las llamadas a uiConfirmar()
 * se pueden volver a confirm() sin más cambios. La app sigue funcionando.
 * ===================================================================== */
(function () {
  'use strict';

  // ==================================================================
  // 1. Overlays de carga
  // ==================================================================

  /**
   * Muestra el overlay de carga del contexto indicado.
   * @param {'boot'|'login'|'logout'} tipo
   */
  function mostrarOverlay(tipo) {
    const overlay = document.getElementById('ui' + capitalizar(tipo) + 'Overlay');
    if (!overlay) return;
    overlay.classList.remove('ui-overlay--oculto');
    overlay.classList.add('ui-overlay--visible');
    overlay.setAttribute('aria-hidden', 'false');
  }

  /**
   * Oculta el overlay de carga del contexto indicado.
   * @param {'boot'|'login'|'logout'} tipo
   */
  function ocultarOverlay(tipo) {
    const overlay = document.getElementById('ui' + capitalizar(tipo) + 'Overlay');
    if (!overlay) return;
    overlay.classList.remove('ui-overlay--visible');
    overlay.classList.add('ui-overlay--oculto');
    overlay.setAttribute('aria-hidden', 'true');
  }

  /** @param {string} texto @returns {string} texto con la inicial en mayúscula. */
  function capitalizar(texto) {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  // El overlay de boot nace visible en el HTML para evitar el destello de la
  // página sin estilos. Se retira en cuanto el DOM está listo: los scripts
  // llevan defer, así que para entonces ya se aplicó el CSS de Bootstrap.
  // Si el DOM ya estaba listo, se retira de inmediato.
  function ocultarBootAlCargar() {
    const ocultar = function () { ocultarOverlay('boot'); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        window.setTimeout(ocultar, 220);
      }, { once: true });
    } else {
      window.setTimeout(ocultar, 220);
    }
  }

  // ==================================================================
  // 2. Overlays de login / logout
  // ==================================================================
  // Se enganchan envolviendo apiRequest, de modo que auth.js y layout.js
  // quedan intactos y el valor devuelto es exactamente el mismo.
  function envolverApiRequestParaOverlays() {
    if (typeof window.apiRequest !== 'function') return;
    const apiRequestOriginal = window.apiRequest;

    window.apiRequest = async function (endpoint, options) {
      const esLogin = endpoint === '/auth/login';
      const esLogout = endpoint === '/auth/logout';

      if (esLogin) mostrarOverlay('login');
      if (esLogout) mostrarOverlay('logout');

      const respuesta = await apiRequestOriginal(endpoint, options);

      // Si el login falla se retira el overlay para poder leer el error.
      // Si funciona, la navegación al destino conserva el overlay visible.
      if (esLogin && !respuesta.ok) ocultarOverlay('login');

      return respuesta;
    };
  }

  // ==================================================================
  // 3. Confirmaciones con modal
  // ==================================================================

  /** Resolver de la confirmación en curso (una a la vez). */
  let resolverConfirmacion = null;

  /**
   * Sustituto visual no bloqueante de window.confirm().
   * @param {string} mensaje
   * @returns {Promise<boolean>} true si el usuario confirma.
   */
  function uiConfirmar(mensaje) {
    const modalEl = document.getElementById('uiModalConfirmacion');
    if (!modalEl || typeof bootstrap === 'undefined') {
      return Promise.resolve(window.confirm(mensaje));
    }

    const texto = document.getElementById('uiConfirmacionMensaje');
    if (texto) texto.textContent = mensaje;

    const instancia = bootstrap.Modal.getOrCreateInstance(modalEl);

    return new Promise(function (resolve) {
      // Solo se resuelve la última confirmación abierta.
      resolverConfirmacion = resolve;

      modalEl.addEventListener('hidden.bs.modal', function () {
        if (resolverConfirmacion) {
          const pendiente = resolverConfirmacion;
          resolverConfirmacion = null;
          pendiente(false); // cerrado sin confirmar (backdrop, Escape, X)
        }
      }, { once: true });

      instancia.show();
    });
  }

  function inicializarModalConfirmacion() {
    const modalEl = document.getElementById('uiModalConfirmacion');
    if (!modalEl) return;

    const btnConfirmar = document.getElementById('uiConfirmacionAceptar');
    const btnCancelar = document.getElementById('uiConfirmacionCancelar');

    // Se resuelve ANTES de ocultar para que el listener 'hidden' no anule
    // la decisión con un false.
    const decidir = function (valor) {
      const resolver = resolverConfirmacion;
      resolverConfirmacion = null;
      bootstrap.Modal.getOrCreateInstance(modalEl).hide();
      if (resolver) resolver(valor);
    };

    if (btnConfirmar) btnConfirmar.addEventListener('click', function () { decidir(true); });
    if (btnCancelar) btnCancelar.addEventListener('click', function () { decidir(false); });
  }

  window.uiConfirmar = uiConfirmar;

  // ==================================================================
  // 4. Menú lateral en móvil (offcanvas espejo de #sidebarNav)
  // ==================================================================
  function inicializarOffcanvasSidebar() {
    const origen = document.getElementById('sidebarNav');
    const destino = document.getElementById('uiSidebarNav');
    const toggler = document.getElementById('uiSidebarToggle');
    if (!origen || !destino) return;

    const sincronizar = function () {
      destino.innerHTML = origen.innerHTML;
      const pagina = window.location.pathname.split('/').pop() || 'dashboard.html';
      destino.querySelectorAll('.nav-link').forEach(function (link) {
        link.classList.toggle('active', link.getAttribute('href') === pagina);
      });
      // Sin entradas de menú no hay nada que mostrar en móvil.
      if (toggler) {
        toggler.style.display = origen.children.length ? 'inline-flex' : 'none';
      }
    };

    sincronizar();
    // layout.js repinta #sidebarNav de forma asíncrona: se observa el cambio.
    new MutationObserver(sincronizar).observe(origen, { childList: true });
  }

  // ==================================================================
  // 5. Tooltips, popovers y alertas
  // ==================================================================
  function inicializarComponentes() {
    if (typeof bootstrap === 'undefined') return;

    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) {
      bootstrap.Tooltip.getOrCreateInstance(el);
    });

    document.querySelectorAll('[data-bs-toggle="popover"]').forEach(function (el) {
      bootstrap.Popover.getOrCreateInstance(el);
    });

    // Las alertas de error se cierran solas para no ensuciar el formulario.
    document.querySelectorAll('.alert.alert-dismissible').forEach(function (alerta) {
      window.setTimeout(function () {
        alerta.classList.remove('show');
        window.setTimeout(function () { alerta.remove(); }, 220);
      }, 6000);
    });
  }

  // ==================================================================
  // 6. Arranque
  // ==================================================================
  // El envoltorio se instala ya: aún no se ha lanzado ninguna petición y
  // así aplica a los handlers de DOMContentLoaded registrados por las
  // páginas (que se ejecutan después).
  envolverApiRequestParaOverlays();
  ocultarBootAlCargar();

  document.addEventListener('DOMContentLoaded', function () {
    inicializarModalConfirmacion();
    inicializarOffcanvasSidebar();
    inicializarComponentes();

    // El foco inicial del login agiliza el acceso por teclado.
    if (document.body.classList.contains('ui-pagina-login')) {
      const campoUsuario = document.getElementById('usuario');
      if (campoUsuario) campoUsuario.focus();
    }
  });
})();