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
 *   - Tooltips de tabla: toda celda con dato muestra un tooltip negro con el
 *     valor completo al pasar el mouse (aunque no esté recortado). Las celdas
 *     de texto se recortan con "..." para no ensanchar la columna.
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
  // 6. Recorte de datos en tablas + tooltip con el valor completo
  // ==================================================================
  // Regla: solo se recortan las celdas de TEXTO cuyo contenido desborda "por
  // mucho" el ancho de su columna (el del encabezado, con un mínimo de 70 px).
  // La medida se hace siempre con una sonda oculta, nunca con el layout real.
  // Únicamente las celdas que quedan recortadas muestran la cajita negra con
  // el dato completo al pasar el cursor por encima de la celda.
  //
  // Las celdas con botones/badges/inputs/enlaces se dejan intactas.

  const ANCHO_MIN_CELDA = 70;   // px: ancho mínimo de la columna (sonda con mínimo)
  const ANCHO_MAX_CELDA = 260;  // px: tope para textos muy largos
  const MARGEN_DESBORDE = 1.2;  // solo recorta si el texto supera ~20% lo disponible

  let tooltipDato = null;
  let celdaConTooltip = null;

  function obtenerTooltipDato() {
    if (!tooltipDato) {
      tooltipDato = document.createElement('div');
      tooltipDato.id = 'uiTooltipDato';
      tooltipDato.className = 'ui-tooltip-dato';
      tooltipDato.setAttribute('role', 'tooltip');
      document.body.appendChild(tooltipDato);
    }
    return tooltipDato;
  }

  function mostrarTooltipDato(celda) {
    const texto = celda.textContent.trim();
    if (!texto) return;
    const tip = obtenerTooltipDato();
    tip.textContent = texto;

    const rect = celda.getBoundingClientRect();
    tip.classList.add('ui-tooltip-dato--visible');
    // Se mide ya visible para recolocarlo dentro de la ventana.
    const ancho = tip.offsetWidth;
    const alto = tip.offsetHeight;
    let x = rect.left;
    let y = rect.bottom + 8;
    if (x + ancho > window.innerWidth - 8) x = window.innerWidth - ancho - 8;
    if (x < 8) x = 8;
    if (y + alto > window.innerHeight - 8) y = rect.top - alto - 8;
    if (y < 8) y = 8;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
    celdaConTooltip = celda;
  }

  function ocultarTooltipDato() {
    if (tooltipDato) tooltipDato.classList.remove('ui-tooltip-dato--visible');
    celdaConTooltip = null;
  }

  /** Ancho natural de un texto medido con una sonda oculta y el estilo de `el`. */
  function anchoTexto(texto, el) {
    if (!texto) return 0;
    const cs = window.getComputedStyle(el);
    const sonda = document.createElement('span');
    sonda.style.cssText =
      'position:absolute;visibility:hidden;white-space:nowrap;top:-9999px;left:-9999px;' +
      'font:' + cs.font + ';letter-spacing:' + cs.letterSpacing +
      ';text-transform:' + cs.textTransform + ';';
    sonda.textContent = texto;
    document.body.appendChild(sonda);
    const ancho = sonda.getBoundingClientRect().width;
    sonda.remove();
    return ancho;
  }

  /** Ancho que ocupa el nombre de la columna (su texto + padding). */
  function anchoEncabezado(th) {
    const cs = window.getComputedStyle(th);
    const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    return Math.ceil(anchoTexto(th.textContent.trim(), th) + pad);
  }

  /** ¿La celda contiene controles/badges que no deben recortarse? */
  function celdaConControles(td) {
    return !!td.querySelector('button, a, input, select, textarea, .badge, .form-check, .spinner-border');
  }

  /** Ajusta el ancho de las celdas de texto de una tabla al de su encabezado. */
  function ajustarTablaDatos(tabla) {
    const ths = tabla.querySelectorAll('thead th');
    if (!ths.length) return;

    const anchos = Array.prototype.map.call(ths, function (th) {
      return Math.min(Math.max(anchoEncabezado(th), ANCHO_MIN_CELDA), ANCHO_MAX_CELDA);
    });
    // Columnas marcadas con .no-recorta (p. ej. fecha/centro/sistema en
    // incidencias) se ven siempre completas: ni se recortan ni llevan tooltip.
    const exentas = Array.prototype.map.call(ths, function (th) {
      return th.classList.contains('no-recorta');
    });

    tabla.querySelectorAll('tbody tr').forEach(function (tr) {
      Array.prototype.forEach.call(tr.children, function (td, i) {
        if (td.hasAttribute('colspan')) return;
        const texto = td.textContent.trim();
        const cs = window.getComputedStyle(td);
        const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        const disponible = Math.max((anchos[i] || 0) - pad, 0);
        // Solo se recortan celdas de TEXTO (sin botones/badges) cuyo contenido
        // desborde "por mucho" el ancho disponible de su columna.
        const desborda = !!texto
          && !exentas[i]
          && !celdaConControles(td)
          && i < anchos.length
          && anchoTexto(texto, td) > disponible * MARGEN_DESBORDE;

        td.classList.toggle('celda-recorta', desborda);
        // El tooltip se muestra únicamente en las celdas que quedan recortadas.
        td.classList.toggle('celda-dato', desborda);
        if (desborda) {
          td.style.maxWidth = anchos[i] + 'px';
        } else {
          td.style.removeProperty('max-width');
        }
      });
    });
  }

  function ajustarTodasLasTablas(raiz) {
    (raiz || document).querySelectorAll('.table-responsive table').forEach(ajustarTablaDatos);
  }

  function inicializarRecorteTablas() {
    // El tooltip se resuelve por delegación: sirve para filas creadas después.
    document.addEventListener('mouseover', function (e) {
      const celda = e.target.closest ? e.target.closest('td.celda-dato') : null;
      if (!celda) { if (celdaConTooltip) ocultarTooltipDato(); return; }
      if (celda !== celdaConTooltip) mostrarTooltipDato(celda);
    });

    document.addEventListener('mouseout', function (e) {
      const celda = e.target.closest ? e.target.closest('td.celda-dato') : null;
      if (celda && celda === celdaConTooltip) ocultarTooltipDato();
    });

    window.addEventListener('scroll', ocultarTooltipDato, true);
    window.addEventListener('resize', function () {
      ocultarTooltipDato();
      ajustarTodasLasTablas();
    });

    ajustarTodasLasTablas();

    // Las tablas se repintan tras cada petición: se reajustan solas.
    document.querySelectorAll('.table-responsive').forEach(function (cont) {
      new MutationObserver(function () {
        ajustarTodasLasTablas(cont);
        ocultarTooltipDato();
      }).observe(cont, { childList: true, subtree: true });
    });
  }

  // ==================================================================
  // 7. Arranque
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
    inicializarRecorteTablas();

    // El foco inicial del login agiliza el acceso por teclado.
    if (document.body.classList.contains('ui-pagina-login')) {
      const campoUsuario = document.getElementById('usuario');
      if (campoUsuario) campoUsuario.focus();
    }
  });
})();