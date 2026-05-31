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
async function iniciarSesion() {
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
}

async function cerrarSesion() {
  await sb.auth.signOut();
  clienteUser = null;
  actualizarHeaderAuth();
}

function actualizarHeaderAuth() {
  const btnLogout    = document.getElementById('btnLogout');
  const btnMisPedidos = document.getElementById('btnMisPedidos');
  if (clienteUser) {
    btnLogout.textContent = 'Salir';
    btnLogout.onclick = cerrarSesion;
    btnMisPedidos.style.display = 'inline-block';
  } else {
    btnLogout.textContent = 'Iniciar sesión';
    btnLogout.onclick = iniciarSesion;
    btnMisPedidos.style.display = 'none';
  }
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
function agregarAlCarrito(producto) {
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

    alert(`✅ ¡Pedido confirmado!\n\nTu pedido #${pedido.id} fue recibido.\nTe contactaremos pronto al número ${telefono}.\n\n¡Gracias por tu compra! 🎉`);

  } catch (err) {
    console.error('Error al confirmar pedido:', err);
    alert(`❌ Error al enviar el pedido: ${err.message}\n\nIntenta nuevamente.`);
  } finally {
    btnConfirmar.disabled = false;
    btnConfirmar.textContent = 'Confirmar Pedido';
  }
}

// ─── MIS PEDIDOS (historial del comprador) ────────────────────
document.getElementById('btnMisPedidos').addEventListener('click', abrirMisPedidos);
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
  const btnGoogle = document.getElementById('btnGoogle');
  if (btnGoogle) btnGoogle.addEventListener('click', iniciarSesion);

  // Escuchar cambios de auth (callback de Google OAuth)
  sb.auth.onAuthStateChange((_event, session) => {
    clienteUser = session?.user || null;
    actualizarHeaderAuth();
    mostrarTienda();
  });

  // Verificar sesión actual
  const { data: { session } } = await sb.auth.getSession();
  clienteUser = session?.user || null;
  actualizarHeaderAuth();

  // La tienda es pública — mostrar siempre sin requerir login
  mostrarTienda();
  await cargarProductos();
}

init();