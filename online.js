// ============================================================
//  online.js — Tienda Online
//  Vinculado a Supabase: zafaxxdznxtiwfhhiwoo
//
//  ⚠️  IMPORTANTE: Reemplaza TU_USER_ID con tu UUID de Supabase.
//  Lo encontrás en: Supabase → Authentication → Users → tu email
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SB_URL  = "https://zafaxxdznxtiwfhhiwoo.supabase.co";
const SB_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphZmF4eGR6bnh0aXdmaGhpd29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTUwNDcsImV4cCI6MjA5NDQ3MTA0N30.u10ddBd2bvMTEubwV8ZntUO6m_YOawSqrzy_76ByV1c";

// ⚠️  REEMPLAZA ESTO con tu UUID real de Supabase Authentication → Users
const TIENDA_OWNER_ID = "e238b6d8-7e51-4e9e-b068-382bce3d9f3d";

const sb = createClient(SB_URL, SB_KEY);

// ─── Estado global ────────────────────────────────────────────
let productos   = [];
let carrito     = [];   // [{ producto, cantidad }]
let clienteUser = null; // sesión del comprador (opcional)

// ─── DOM ──────────────────────────────────────────────────────
const loadingMsg       = document.getElementById('loadingMsg');
const emptyMsg         = document.getElementById('emptyMsg');
const tiendaContenido  = document.getElementById('tiendaContenido');
const carritoCount     = document.getElementById('carritoCount');
const carritoTotal     = document.getElementById('carritoTotal');
const carritoItems     = document.getElementById('carritoItems');
const carritoPanel     = document.getElementById('carritoPanel');
const carritoOverlay   = document.getElementById('carritoOverlay');
const modalCheckout    = document.getElementById('modalCheckout');
const checkoutResumen  = document.getElementById('checkoutResumen');
const checkoutTotalFinal = document.getElementById('checkoutTotalFinal');
const modalMisPedidos  = document.getElementById('modalMisPedidos');
const listaMisPedidos  = document.getElementById('listaMisPedidos');
const inputBuscar      = document.getElementById('inputBuscar');

// ─── AUTH (cliente comprador) ─────────────────────────────────
async function iniciarSesion(forzarCuenta = false) {
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.href,
      queryParams: forzarCuenta ? { prompt: 'select_account' } : {}
    }
  });
}

async function cerrarSesion() {
  await sb.auth.signOut();
  clienteUser = null;
  actualizarHeaderAuth();
}

function actualizarHeaderAuth() {
  const btnUserMenu   = document.getElementById('btnUserMenu');
  const menuSinSesion = document.getElementById('menuSinSesion');
  const menuConSesion = document.getElementById('menuConSesion');
  const menuUserEmail = document.getElementById('menuUserEmail');
  if (!btnUserMenu) return;

  if (clienteUser) {
    const email  = clienteUser.email || '';
    const nombre = clienteUser.user_metadata?.full_name || clienteUser.user_metadata?.name || email.split('@')[0];
    btnUserMenu.textContent = nombre;
    if (menuUserEmail) menuUserEmail.textContent = email;
    if (menuSinSesion) menuSinSesion.style.display = 'none';
    if (menuConSesion) menuConSesion.style.display = 'block';
  } else {
    btnUserMenu.textContent = 'Iniciar sesion';
    if (menuSinSesion) menuSinSesion.style.display = 'block';
    if (menuConSesion) menuConSesion.style.display = 'none';
  }
}

function inicializarMenuUsuario() {
  const btnUserMenu    = document.getElementById('btnUserMenu');
  const dropdown       = document.getElementById('userMenuDropdown');
  const menuBtnLogin   = document.getElementById('menuBtnLogin');
  const menuBtnPedidos = document.getElementById('menuBtnPedidos');
  const menuBtnCambiar = document.getElementById('menuBtnCambiarCuenta');
  const menuBtnSalir   = document.getElementById('menuBtnSalir');

  if (!btnUserMenu || !dropdown) return;

  btnUserMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', () => { dropdown.style.display = 'none'; });
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  if (menuBtnLogin)   menuBtnLogin.addEventListener('click',   () => { dropdown.style.display='none'; iniciarSesion(false); });
  if (menuBtnPedidos) menuBtnPedidos.addEventListener('click', () => { dropdown.style.display='none'; abrirMisPedidos(); });
  if (menuBtnCambiar) menuBtnCambiar.addEventListener('click', () => { dropdown.style.display='none'; iniciarSesion(true); });
  if (menuBtnSalir)   menuBtnSalir.addEventListener('click',   () => { dropdown.style.display='none'; cerrarSesion(); });
}

// ─── CARGAR PRODUCTOS (solo del dueño de la tienda) ───────────
async function cargarProductos() {
  loadingMsg.style.display = 'block';
  emptyMsg.style.display   = 'none';
  tiendaContenido.innerHTML = '';

  const { data, error } = await sb
    .from('productos')
    .select('id, nombre, precio, cantidad, imagen_url, categoria')
    .eq('user_id', TIENDA_OWNER_ID)
    .gt('cantidad', 0)           // solo con stock disponible
    .order('nombre', { ascending: true });

  loadingMsg.style.display = 'none';

  if (error) {
    console.error('Error cargando productos:', error);
    emptyMsg.textContent = 'Error al cargar productos. Intenta más tarde.';
    emptyMsg.style.display = 'block';
    return;
  }

  productos = data || [];

  if (productos.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }

  renderTienda(productos);
}

// ─── RENDER TIENDA (agrupado por categoría) ───────────────────
const CATEGORIAS_ORDEN = [
  'Perecederos','Abarrotes','Bebidas','Congelados','Hogar','Higiene','Otras'
];

function renderTienda(lista) {
  tiendaContenido.innerHTML = '';

  // Agrupar por categoría
  const grupos = {};
  lista.forEach(p => {
    const cat = p.categoria || 'Otras';
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(p);
  });

  // Renderizar en el orden definido
  const cats = CATEGORIAS_ORDEN.filter(c => grupos[c]);
  // Categorías extra que no estén en el orden predefinido
  Object.keys(grupos).forEach(c => { if (!cats.includes(c)) cats.push(c); });

  cats.forEach(cat => {
    const seccion = document.createElement('section');
    seccion.className = 'categoria-seccion';
    seccion.innerHTML = `<h2 class="categoria-titulo">${cat}</h2>`;

    const grid = document.createElement('div');
    grid.className = 'productos-grid';

    grupos[cat].forEach(p => {
      const card = crearCardProducto(p);
      grid.appendChild(card);
    });

    seccion.appendChild(grid);
    tiendaContenido.appendChild(seccion);
  });
}

function crearCardProducto(p) {
  const div = document.createElement('div');
  div.className = 'producto-card';
  div.dataset.id = p.id;

  const img = p.imagen_url
    ? `<img src="${p.imagen_url}" alt="${p.nombre}" class="producto-img" loading="lazy">`
    : `<div class="producto-img-placeholder">📦</div>`;

  div.innerHTML = `
    ${img}
    <div class="producto-info">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$${Number(p.precio).toLocaleString('es-CO')}</p>
      <p class="producto-stock">Stock: ${p.cantidad}</p>
    </div>
    <button class="btn-agregar-carrito" data-id="${p.id}">+ Agregar</button>
  `;

  div.querySelector('.btn-agregar-carrito').addEventListener('click', () => agregarAlCarrito(p));
  return div;
}

// ─── FILTROS ──────────────────────────────────────────────────
document.getElementById('categoriasFiltro').addEventListener('click', e => {
  const btn = e.target.closest('.btn-categoria');
  if (!btn) return;

  document.querySelectorAll('.btn-categoria').forEach(b => b.classList.remove('activa'));
  btn.classList.add('activa');

  const cat = btn.dataset.cat;
  const filtrados = cat === 'todas'
    ? productos
    : productos.filter(p => p.categoria === cat);

  renderTienda(filtrados);
});

inputBuscar.addEventListener('input', () => {
  const q = inputBuscar.value.toLowerCase().trim();
  const filtrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(q) ||
    (p.categoria || '').toLowerCase().includes(q)
  );
  renderTienda(filtrados);
});

// ─── CARRITO ──────────────────────────────────────────────────

// ─── MODAL LOGIN REQUERIDO ────────────────────────────────────
function mostrarModalLogin() {
  // Crear modal si no existe
  let modal = document.getElementById('modalLoginRequerido');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalLoginRequerido';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:32px 24px;max-width:360px;width:100%;text-align:center;">
        <div style="font-size:3rem;margin-bottom:12px;">🛒</div>
        <h3 style="margin:0 0 8px;font-size:1.2rem;color:#222;">Inicia sesión para comprar</h3>
        <p style="color:#888;font-size:.9rem;margin:0 0 24px;line-height:1.5;">Necesitas una cuenta para agregar productos al carrito y realizar pedidos.</p>
        <button id="modalLoginBtn" style="width:100%;padding:12px;background:#2d6a4f;color:#fff;border:none;border-radius:12px;font-size:1rem;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:10px;">
          <svg viewBox="0 0 48 48" width="18" height="18"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Iniciar sesión con Google
        </button>
        <button id="modalLoginCerrar" style="width:100%;padding:10px;background:transparent;border:2px solid #ddd;border-radius:12px;font-size:.9rem;cursor:pointer;font-family:inherit;color:#666;">Seguir viendo productos</button>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('modalLoginBtn').addEventListener('click', () => {
      modal.style.display = 'none';
      iniciarSesion(false);
    });
    document.getElementById('modalLoginCerrar').addEventListener('click', () => {
      modal.style.display = 'none';
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  } else {
    modal.style.display = 'flex';
  }
}

function agregarAlCarrito(producto) {
  // Requiere sesión para comprar
  if (!clienteUser) {
    mostrarModalLogin();
    return;
  }

  const item = carrito.find(i => i.producto.id === producto.id);
  const enCarrito = item ? item.cantidad : 0;

  if (enCarrito >= producto.cantidad) {
    alert(`Solo hay ${producto.cantidad} unidades disponibles de "${producto.nombre}".`);
    return;
  }

  if (item) {
    item.cantidad++;
  } else {
    carrito.push({ producto, cantidad: 1 });
  }

  renderCarrito();
  abrirCarrito();
}

function renderCarrito() {
  const total = carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0);
  const count = carrito.reduce((s, i) => s + i.cantidad, 0);

  carritoCount.textContent = count;
  carritoTotal.textContent = total.toLocaleString('es-CO');

  if (carrito.length === 0) {
    carritoItems.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío.</p>';
    return;
  }

  carritoItems.innerHTML = carrito.map((item, idx) => `
    <div class="carrito-item">
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${item.producto.nombre}</span>
        <span class="carrito-item-precio">$${(item.producto.precio * item.cantidad).toLocaleString('es-CO')}</span>
      </div>
      <div class="carrito-item-controles">
        <button class="btn-qty" data-idx="${idx}" data-delta="-1">−</button>
        <span>${item.cantidad}</span>
        <button class="btn-qty" data-idx="${idx}" data-delta="1">+</button>
        <button class="btn-eliminar-item" data-idx="${idx}">🗑</button>
      </div>
    </div>
  `).join('');

  carritoItems.querySelectorAll('.btn-qty').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx   = parseInt(btn.dataset.idx);
      const delta = parseInt(btn.dataset.delta);
      cambiarCantidadCarrito(idx, delta);
    });
  });

  carritoItems.querySelectorAll('.btn-eliminar-item').forEach(btn => {
    btn.addEventListener('click', () => {
      carrito.splice(parseInt(btn.dataset.idx), 1);
      renderCarrito();
    });
  });
}

function cambiarCantidadCarrito(idx, delta) {
  const item = carrito[idx];
  if (!item) return;
  const nueva = item.cantidad + delta;
  if (nueva <= 0) {
    carrito.splice(idx, 1);
  } else if (nueva > item.producto.cantidad) {
    alert(`Stock máximo disponible: ${item.producto.cantidad}`);
  } else {
    item.cantidad = nueva;
  }
  renderCarrito();
}

function abrirCarrito() {
  carritoPanel.classList.add('abierto');
  carritoOverlay.style.display = 'block';
}

function cerrarCarrito() {
  carritoPanel.classList.remove('abierto');
  carritoOverlay.style.display = 'none';
}

document.getElementById('btnAbrirCarrito').addEventListener('click', abrirCarrito);
document.getElementById('btnCerrarCarrito').addEventListener('click', cerrarCarrito);
carritoOverlay.addEventListener('click', cerrarCarrito);

// ─── CHECKOUT ─────────────────────────────────────────────────
document.getElementById('btnCheckout').addEventListener('click', () => {
  if (carrito.length === 0) return;
  abrirCheckout();
});

function abrirCheckout() {
  const total = carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0);

  checkoutResumen.innerHTML = carrito.map(i => `
    <div class="checkout-item">
      <span>${i.producto.nombre} × ${i.cantidad}</span>
      <span>$${(i.producto.precio * i.cantidad).toLocaleString('es-CO')}</span>
    </div>
  `).join('');

  checkoutTotalFinal.textContent = total.toLocaleString('es-CO');

  // Pre-rellenar con datos del cliente si tiene sesión
  if (clienteUser) {
    document.getElementById('chkNombre').value =
      clienteUser.user_metadata?.full_name || clienteUser.user_metadata?.name || '';
  }

  modalCheckout.style.display = 'flex';
  cerrarCarrito();
}

document.getElementById('btnCerrarCheckout').addEventListener('click', () => {
  modalCheckout.style.display = 'none';
});

document.getElementById('btnConfirmarPedido').addEventListener('click', confirmarPedido);

async function confirmarPedido() {
  const nombre    = document.getElementById('chkNombre').value.trim();
  const telefono  = document.getElementById('chkTelefono').value.trim();
  const direccion = document.getElementById('chkDireccion').value.trim();
  const notas     = document.getElementById('chkNotas').value.trim();

  if (!nombre)    { alert('Por favor ingresa tu nombre.'); return; }
  if (!telefono)  { alert('Por favor ingresa tu teléfono.'); return; }
  if (!direccion) { alert('Por favor ingresa tu dirección de entrega.'); return; }

  const total = carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0);
  const btnConfirmar = document.getElementById('btnConfirmarPedido');
  btnConfirmar.disabled = true;
  btnConfirmar.textContent = 'Enviando pedido... ⏳';

  try {
    // 1. Insertar pedido en la tabla `pedidos`
    const { data: pedido, error: errPedido } = await sb
      .from('pedidos')
      .insert([{
        cliente_nombre: nombre,
        cliente_tel:    telefono,
        cliente_email:  clienteUser?.email || null,
        direccion:      direccion,
        notas:          notas || null,
        total:          total,
        metodo_pago:    'contra_entrega',
        estado:         'pendiente',
        tienda_user_id: TIENDA_OWNER_ID   // ← vincula el pedido a TU tienda
      }])
      .select()
      .single();

    if (errPedido) throw errPedido;

    // 2. Insertar los items del pedido en `items_pedido`
    const items = carrito.map(i => ({
      pedido_id: pedido.id,
      nombre:    i.producto.nombre,
      cantidad:  i.cantidad,
      precio:    i.producto.precio,
      subtotal:  i.producto.precio * i.cantidad
    }));

    const { error: errItems } = await sb.from('items_pedido').insert(items);
    if (errItems) throw errItems;

    // ✅ Pedido creado — limpiar carrito y mostrar confirmación
    carrito = [];
    renderCarrito();
    modalCheckout.style.display = 'none';
    document.getElementById('chkNombre').value    = '';
    document.getElementById('chkTelefono').value  = '';
    document.getElementById('chkDireccion').value = '';
    document.getElementById('chkNotas').value     = '';

    alert(`✅ ¡Pedido confirmado!\n\nTu pedido #${String(pedido.numero_pedido).padStart(3,'0')} fue recibido.\nTe contactaremos pronto al número ${telefono}.\n\n¡Gracias por tu compra! 🎉`);

  } catch (err) {
    console.error('Error al confirmar pedido:', err);
    alert(`❌ Error al enviar el pedido: ${err.message}\n\nIntenta nuevamente.`);
  } finally {
    btnConfirmar.disabled = false;
    btnConfirmar.textContent = 'Confirmar Pedido';
  }
}

// ─── MIS PEDIDOS (historial del comprador) ────────────────────
// btnMisPedidos ahora está en el menú desplegable
document.getElementById('btnCerrarMisPedidos').addEventListener('click', () => {
  modalMisPedidos.style.display = 'none';
});

async function abrirMisPedidos() {
  if (!clienteUser) { iniciarSesion(); return; }
  modalMisPedidos.style.display = 'flex';
  listaMisPedidos.innerHTML = '<p>Cargando...</p>';

  const { data, error } = await sb
    .from('pedidos')
    .select('id, estado, total, fecha, items_pedido(nombre, cantidad, precio)')
    .eq('cliente_email', clienteUser.email)
    .eq('tienda_user_id', TIENDA_OWNER_ID)
    .order('id', { ascending: false });

  if (error) {
    listaMisPedidos.innerHTML = `<p style="color:red">Error: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    listaMisPedidos.innerHTML = '<p style="text-align:center;color:#888;">Aún no tienes pedidos.</p>';
    return;
  }

  const ESTADO_LABELS = {
    pendiente:         '🕐 Pendiente',
    esperando_pago:    '💳 Esperando pago',
    pago_confirmado:   '✅ Pago confirmado',
    en_camino:         '🚚 En camino',
    entregado:         '📦 Entregado',
    cancelado:         '❌ Cancelado'
  };

  listaMisPedidos.innerHTML = data.map(p => `
    <div class="pedido-cliente-card">
      <div class="pedido-cliente-header">
        <span><strong>Pedido #${p.id}</strong></span>
        <span class="pedido-estado-badge">${ESTADO_LABELS[p.estado] || p.estado}</span>
      </div>
      <div class="pedido-cliente-items">
        ${(p.items_pedido || []).map(i =>
          `<div>${i.nombre} × ${i.cantidad} — $${(i.precio * i.cantidad).toLocaleString('es-CO')}</div>`
        ).join('')}
      </div>
      <div class="pedido-cliente-total">Total: <strong>$${Number(p.total).toLocaleString('es-CO')}</strong></div>
      ${p.fecha ? `<div class="pedido-cliente-fecha">${new Date(p.fecha).toLocaleDateString('es-CO')}</div>` : ''}
    </div>
  `).join('');
}

// ─── INIT ─────────────────────────────────────────────────────
function mostrarTienda() {
  document.getElementById('pantalla-login').style.display  = 'none';
  document.getElementById('pantalla-tienda').style.display = 'block';
}

async function init() {
  // Botón Google en pantalla login
  inicializarMenuUsuario();
  const btnGoogle = document.getElementById('btnGoogle');
  if (btnGoogle) btnGoogle.addEventListener('click', iniciarSesion);

  // Verificar sesión actual primero
  const { data: { session } } = await sb.auth.getSession();
  clienteUser = session?.user || null;
  actualizarHeaderAuth();

  if (clienteUser) {
    mostrarTienda();
    await cargarProductos();
  }
  // Si no hay sesión, la pantalla login ya está visible por defecto

  // Escuchar cambios de auth posteriores (login / logout)
  sb.auth.onAuthStateChange(async (_event, newSession) => {
    const anteriorUser = clienteUser;
    clienteUser = newSession?.user || null;
    actualizarHeaderAuth();

    if (clienteUser && !anteriorUser) {
      // Acaba de iniciar sesión
      mostrarTienda();
      await cargarProductos();
    } else if (!clienteUser && anteriorUser) {
      // Acaba de cerrar sesión
      document.getElementById('pantalla-login').style.display  = 'flex';
      document.getElementById('pantalla-tienda').style.display = 'none';
    }
  });
}

init();// Estilos inyectados para el menú de usuario
(function() {
  const style = document.createElement('style');
  style.textContent = `
    .user-menu-container { position: relative; }

    .btn-user-menu {
      background: transparent;
      border: 2px solid #2d6a4f;
      color: #2d6a4f;
      border-radius: 10px;
      padding: 7px 14px;
      font-size: .875rem;
      cursor: pointer;
      font-family: inherit;
      font-weight: 700;
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn-user-menu:hover { background: #f0faf4; }

    .user-menu-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      background: #fff;
      border-radius: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,.15);
      min-width: 260px;
      z-index: 500;
      overflow: hidden;
      border: 1px solid #e8e8e8;
    }

    .user-menu-hint {
      padding: 14px 16px 10px;
      font-size: .8rem;
      color: #888;
      line-height: 1.4;
      border-bottom: 1px solid #f0f0f0;
    }

    .user-menu-email {
      padding: 12px 16px 8px;
      font-size: .85rem;
      font-weight: 700;
      color: #333;
      border-bottom: 1px solid #f0f0f0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 12px 16px;
      background: none;
      border: none;
      font-family: inherit;
      font-size: .9rem;
      cursor: pointer;
      text-align: left;
      color: #333;
      transition: background .15s;
    }
    .user-menu-item:hover { background: #f5f5f5; }
    .user-menu-login { color: #2d6a4f; font-weight: 700; }
    .user-menu-salir { color: #e63946; }

    .user-menu-divider {
      border: none;
      border-top: 1px solid #f0f0f0;
      margin: 4px 0;
    }
  `;
  document.head.appendChild(style);
})();