// ═══════════════════════════════════════════════
//  fën · Órdenes B2B (logística)  v1.5.0 (Gastos con la plata de los cobros y etiqueta del sobre de 80 × 50 mm, directo por Bluetooth)
//  v1.4.0: Cobros en efectivo: llega a Sistema Fën → Efectivo → Por recibir
//  v1.3.1: precio especial por el ID del producto
//  Crea y edita órdenes directo en la base nueva (fen-b2b): rápido y en vivo.
//  v1.3.0: la copia a la planilla está apagada (ya no se llama al script b2b_planilla); cada línea guarda su foto (catalogoId, tipo,
//  área, receta o reventa); "Producto nuevo" pide de la lista del Catálogo de Sistema Fën (config/catalogoDisponible), con su catalogoId.
// ═══════════════════════════════════════════════
import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence,
  collection, doc, getDoc, getDocs, query, where, onSnapshot, runTransaction, addDoc, updateDoc, serverTimestamp
} from './firebase.js?v=1.5.0';
import * as M from './modelo.js?v=1.5.0';
import * as Pdf from './pdf.js?v=1.5.0';
import * as Et from './etiqueta.js?v=1.5.0';   // v1.5.0: etiqueta de 80 × 50 mm del sobre

const F = window.FEN_LOG;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
const AREAS = { PAN: 'Panadería', BOL: 'Bollería', PAS: 'Pastelería', CAF: 'Cafetería', REVENTA: 'Reventa', B2B: 'Canal B2B' };   // los de areas.js de Sistema Fën
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const diaCorto = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]}` : (f || ''); };

const E = {
  user: null, rol: null, cfg: { activa: false, scriptUrl: '' },
  clientes: [], productos: [], ordenes: new Map(), solicitudes: [], disponible: null,
  gastos: [], escuchas: [], form: null, cobros: { fecha: '', sel: new Set(), guardando: false }, filtro: '', soloSinFolio: false, sinc: { corriendo: false, error: '', ultima: 0 }
};

function avisar(texto, mal) {
  const el = $('aviso-flotante'); el.textContent = texto; el.classList.toggle('mal', !!mal); el.classList.remove('oculto');
  clearTimeout(avisar.t); avisar.t = setTimeout(() => el.classList.add('oculto'), mal ? 7000 : 3500);
}
function mensajeError(e) {
  const c = (e && e.code) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return 'Correo o contraseña incorrectos.';
  if (/too-many-requests/.test(c)) return 'Demasiados intentos. Espera unos minutos.';
  if (/network-request-failed|unavailable/.test(c)) return 'Sin conexión. Revisa internet y vuelve a probar.';
  if (/permission-denied/.test(c)) return 'La base no dejó guardar (permiso). Si se repite, avísale a Emmanuel.';
  return (e && e.message) || 'No se pudo completar.';
}

// ── Entrar / salir ─────────────────────────────────
function mostrar(id) { ['cargando', 'entrada', 'app'].forEach(x => $(x).classList.toggle('oculto', x !== id)); }
$('form-entrar').addEventListener('submit', async ev => {
  ev.preventDefault();
  const btn = $('btn-entrar'); btn.disabled = true; btn.textContent = 'Entrando…'; $('error-entrada').textContent = '';
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, $('correo').value.trim(), $('clave').value);
    $('clave').value = '';
  } catch (e) { $('error-entrada').textContent = mensajeError(e); }
  btn.disabled = false; btn.textContent = 'Entrar';
});
$('btn-salir').addEventListener('click', async () => { if (confirm('¿Salir de esta cuenta en este equipo?')) { cerrarEscuchas(); await signOut(auth); } });

async function rolDe(u) {
  try { if ((await getDoc(doc(db, 'logistica', u.uid))).exists()) return 'logistica'; } catch (e) {}
  try { if ((await getDoc(doc(db, 'admins', u.uid))).exists()) return 'admin'; } catch (e) {}
  return null;
}
onAuthStateChanged(auth, async u => {
  cerrarEscuchas();
  if (!u) { E.user = null; mostrar('entrada'); return; }
  mostrar('cargando');
  const rol = await rolDe(u);
  if (!rol) { await signOut(auth); mostrar('entrada'); $('error-entrada').textContent = 'Esta cuenta no tiene acceso a las órdenes B2B.'; return; }
  E.user = u; E.rol = rol;
  escuchar();
  mostrar('app');
  pintarAvisoModo();
  irA(vistaDesdeHash());
  Et.prepararLogo('logo-etiqueta.png?v=1.5.0');   // v1.5.0: para que la etiqueta salga al tiro al tocar
});

// ── Datos en vivo ──────────────────────────────────
function cerrarEscuchas() { E.escuchas.forEach(f => { try { f(); } catch (e) {} }); E.escuchas = []; E.ordenes = new Map(); E.gastos = []; }
function escuchar() {
  const err = e => avisar(mensajeError(e), true);
  // Si Emmanuel activa (o vuelve atrás) la base nueva, la app se entera al tiro
  E.escuchas.push(onSnapshot(doc(db, 'config', 'b2b'), c => {
    const antes = E.cfg.activa;
    E.cfg = c.exists() ? { activa: !!c.data().activa, scriptUrl: c.data().scriptUrl || '' } : { activa: false, scriptUrl: '' };
    pintarAvisoModo();
    if (antes !== E.cfg.activa && vistaDesdeHash() === 'nueva' && !(E.form && E.form.tocado)) pintarNueva();
    if (antes !== E.cfg.activa && vistaDesdeHash() === 'ordenes') pintarOrdenes();
  }, () => {}));
  E.escuchas.push(onSnapshot(collection(db, 'clientes'), sn => {
    E.clientes = sn.docs.map(d => ({ id: d.id, ...d.data() })).filter(M.vigente).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    refrescar('nueva');
  }, err));
  E.escuchas.push(onSnapshot(collection(db, 'productos'), sn => {
    E.productos = sn.docs.map(d => ({ id: d.id, ...d.data() })).filter(M.vigente).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    refrescar('nueva');
  }, err));
  const desde = M.hoy(new Date(Date.now() - F.DIAS_LISTA * 864e5));
  const juntar = clave => sn => {
    sn.docChanges().forEach(c => { if (c.type === 'removed') { const o = E.ordenes.get(c.doc.id); if (o && o._de === clave) E.ordenes.delete(c.doc.id); } else E.ordenes.set(c.doc.id, { id: c.doc.id, _de: clave, ...c.doc.data() }); });
    refrescar('ordenes'); refrescar('cobros'); pintarEstadoPlanilla();
  };
  E.escuchas.push(onSnapshot(query(collection(db, 'ordenes'), where('fecha', '>=', desde)), juntar('recientes'), err));
  E.escuchas.push(onSnapshot(query(collection(db, 'ordenes'), where('sinFolio', '==', true)), juntar('sinFolio'), err));
  // v1.5.0 · Sus gastos con la plata de los cobros (gastos_logistica, solo los suyos)
  E.escuchas.push(onSnapshot(query(collection(db, 'gastos_logistica'), where('por', '==', E.user.email)), sn => {
    E.gastos = sn.docs.map(d => ({ id: d.id, ...d.data() }));
    refrescar('cobros');
  }, err));
  E.escuchas.push(onSnapshot(query(collection(db, 'solicitudes'), where('por', '==', E.user.email)), sn => {
    E.solicitudes = sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ((b.en && b.en.toMillis && b.en.toMillis()) || 0) - ((a.en && a.en.toMillis && a.en.toMillis()) || 0));
    refrescar('solicitudes'); if (vistaDesdeHash() === 'ordenes') pintarOrdenes();
    pintarRespuestas();
  }, err));
}
function refrescar(v) {
  if (vistaDesdeHash() === v && !(v === 'nueva' && E.form && E.form.tocado)) irA(v);
  else if (v === 'nueva' && E.form && vistaDesdeHash() === 'nueva') {
    // Con una orden a medio escribir no se repinta todo: solo la lista de clientes y las líneas
    const sel = $('f-cliente');
    if (sel) sel.innerHTML = `<option value="">Elige…</option>${E.clientes.map(c => `<option value="${esc(c.id)}" ${c.id === E.form.clienteId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}`;
    pintarLineas();
  }
}
function pintarAvisoModo() {
  const a = $('aviso-modo');
  if (E.cfg.activa) { a.classList.add('oculto'); return; }
  a.textContent = 'Todavía se usa la app B2B de siempre. Esta app se activa cuando Emmanuel cambie a la base nueva (desde Sistema Fën). Mientras tanto puedes mirar, pero no crear órdenes.';
  a.classList.remove('oculto');
}

// ── Respuestas a sus solicitudes: un aviso arriba hasta que presiona "Entendido" ──
function pintarRespuestas() {
  const el = $('respuestas'); if (!el) return;
  const nuevas = E.solicitudes.filter(s => (s.estado === 'aprobada' || s.estado === 'rechazada') && !s.vista);
  const que = s => s.tipo === 'anulacion' ? `la anulación de la orden N° ${esc(s.n)}` : s.tipo === 'precio' ? `el precio de ${esc(s.producto)} para ${esc(s.cliente)}${s.precioAprobado ? ' (' + pesos(s.precioAprobado) + ')' : ''}` : `el producto nuevo ${esc(s.producto)}${s.precioAprobado ? ' (' + pesos(s.precioAprobado) + ')' : ''}`;
  el.innerHTML = nuevas.map(s => `<div class="respuesta ${s.estado === 'aprobada' ? 'c-verde' : 'c-rojo'}" role="status"><div><b>${s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}:</b> ${que(s)}${s.respuesta && s.respuesta !== 'Anulada' ? ` · <i>"${esc(s.respuesta)}"</i>` : ''}</div><button type="button" class="btn-sec btn-chico" data-visto="${esc(s.id)}">Entendido</button></div>`).join('');
  el.querySelectorAll('[data-visto]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await updateDoc(doc(db, 'solicitudes', b.dataset.visto), { vista: true, vistaEn: serverTimestamp() }); }
    catch (e) { b.disabled = false; avisar(mensajeError(e), true); }
  }));
}

// ── Copia a la planilla: APAGADA desde la v1.3.0 (Sistema Fën v0.73.0 apagó las copias en vivo; la planilla queda como historial) ──
function pintarEstadoPlanilla() {
  const el = $('estado-planilla');
  if (el) el.textContent = 'v' + F.VERSION;   // v1.5.0: la versión a la vista (la copia a la planilla sigue apagada)
}
function pasarAPlanilla() { /* v1.3.0: apagada (ya no se llama al script b2b_planilla) */ }

// ── Navegación ─────────────────────────────────────
const VISTAS = ['nueva', 'ordenes', 'cobros', 'solicitudes'];
const vistaDesdeHash = () => { const v = (location.hash || '').replace('#', ''); return VISTAS.includes(v) ? v : 'nueva'; };
window.addEventListener('hashchange', () => { if (E.user) irA(vistaDesdeHash()); });
function irA(v) {
  VISTAS.forEach(x => $('v-' + x).classList.toggle('oculto', x !== v));
  document.querySelectorAll('.barra-inf a').forEach(a => { if (a.dataset.vista === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (v === 'nueva') pintarNueva();
  if (v === 'ordenes') pintarOrdenes();
  if (v === 'cobros') pintarCobros();
  if (v === 'solicitudes') pintarSolicitudes();
}

// ── Nueva orden / editar ───────────────────────────
const cliente = id => E.clientes.find(c => c.id === id);
const producto = id => E.productos.find(p => p.id === id);
function formVacio() { return { editando: null, fecha: M.hoy(), clienteId: '', lineas: [{ productoId: '', cantidad: '' }], obs: '', motivo: '', tocado: false }; }
function lineasDelForm() {
  const f = E.form, cli = cliente(f.clienteId);
  return M.juntarLineas(f.lineas.filter(l => l.productoId && Number(l.cantidad) > 0).map(l => {
    const p = producto(l.productoId) || { id: null, nombre: l.nombre || l.productoId, precioBase: l.precio };
    // v1.3.0: al editar, la línea del mismo producto conserva su foto (la venta guarda lo que era al crearla)
    const foto = l.foto && (!p.id || !p.catalogoId || p.catalogoId === l.foto.catalogoId) ? l.foto : null;
    // Al editar, una línea que ya estaba mantiene su precio; las nuevas toman el de la lista
    const precio = l.precioFijo != null ? l.precioFijo : M.precioPara(cli, p).precio;
    return M.linea(p, l.cantidad, precio, foto);
  }));
}
function pintarNueva() {
  if (!E.form) E.form = formVacio();
  const f = E.form, ed = f.editando;
  $('v-nueva').innerHTML = `
    <h1 id="t-nueva">${ed ? `Editar orden N° ${ed.n}` : 'Nueva orden'}</h1>
    ${!E.cfg.activa && !ed ? '<p class="ayuda">Esta app todavía no está activa (ver aviso arriba).</p>' : ''}
    <div class="tarjeta" style="display:flex;flex-direction:column;gap:12px">
      <div class="fila2">
        <div class="campo"><label for="f-fecha">Fecha</label><input type="date" id="f-fecha" value="${esc(f.fecha)}"></div>
        <div class="campo"><label for="f-cliente">Cliente</label><select id="f-cliente"><option value="">Elige…</option>${E.clientes.map(c => `<option value="${esc(c.id)}" ${c.id === f.clienteId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
      </div>
      <div id="f-lineas"></div>
      <button type="button" class="btn-sec" id="f-agregar">+ Agregar producto</button>
      <div class="campo"><label for="f-obs">Notas</label><textarea id="f-obs" rows="2" placeholder="Opcional">${esc(f.obs)}</textarea></div>
      ${ed ? `<div class="campo"><label for="f-motivo">Motivo de la edición</label><input id="f-motivo" value="${esc(f.motivo)}" placeholder="Ej: el cliente pidió 2 hogazas más" required></div>` : ''}
      <div class="totales" id="f-totales"></div>
      <div class="error" id="f-error" role="alert"></div>
      <div class="botones">${ed ? '<button type="button" class="btn-sec" id="f-cancelar">Cancelar</button>' : ''}<button type="button" class="btn" id="f-guardar" style="flex:1" ${!E.cfg.activa && !ed ? 'disabled' : ''}>${ed ? 'Guardar cambios' : 'Guardar orden'}</button></div>
    </div>`;
  pintarLineas();
  $('f-fecha').addEventListener('change', e => { f.fecha = e.target.value; f.tocado = true; });
  $('f-cliente').addEventListener('change', e => { f.clienteId = e.target.value; f.tocado = true; pintarLineas(); });
  $('f-obs').addEventListener('input', e => { f.obs = e.target.value; f.tocado = true; });
  if (ed) $('f-motivo').addEventListener('input', e => { f.motivo = e.target.value; });
  $('f-agregar').addEventListener('click', () => { f.lineas.push({ productoId: '', cantidad: '' }); f.tocado = true; pintarLineas(); const s = document.querySelectorAll('#f-lineas select'); s[s.length - 1].focus(); });
  if (ed) $('f-cancelar').addEventListener('click', () => { E.form = formVacio(); location.hash = '#ordenes'; });
  $('f-guardar').addEventListener('click', guardar);
}
function pintarLineas() {
  const f = E.form, cont = $('f-lineas'); if (!cont) return;
  const cli = cliente(f.clienteId);
  cont.innerHTML = f.lineas.map((l, i) => {
    const p = producto(l.productoId);
    const pr = l.precioFijo != null ? { precio: l.precioFijo, especial: false, fijo: true } : M.precioPara(cli, p);
    const sub = (Number(l.cantidad) || 0) * pr.precio;
    const sinProducto = l.productoId && !p;
    return `<div class="linea-orden">
      <div class="campo"><label for="l-p-${i}">Producto</label><select id="l-p-${i}" data-i="${i}" class="l-prod"><option value="">Elige…</option>${E.productos.map(x => `<option value="${esc(x.id)}" ${x.id === l.productoId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}${sinProducto ? `<option value="${esc(l.productoId)}" selected>${esc(l.nombre || l.productoId)}</option>` : ''}</select></div>
      <div class="campo"><label for="l-c-${i}">Cantidad</label><input id="l-c-${i}" data-i="${i}" class="l-cant" type="number" inputmode="numeric" min="1" step="1" value="${esc(l.cantidad)}"></div>
      <button type="button" class="btn-quitar" data-quitar="${i}" aria-label="Quitar esta línea">×</button>
      <div class="precio">${l.productoId ? `${pesos(pr.precio)} neto c/u${pr.especial ? ' · <span class="chip c-verde">precio especial</span>' : pr.fijo ? ' · precio de la orden' : ''}${sub ? ' · ' + pesos(sub) : ''}${!cli && !pr.fijo ? ' · elige el cliente para ver su precio' : ''}` : ''}</div>
    </div>`;
  }).join('');
  cont.querySelectorAll('.l-prod').forEach(s => s.addEventListener('change', e => { const l = f.lineas[e.target.dataset.i]; l.productoId = e.target.value; l.precioFijo = null; l.foto = null; f.tocado = true; pintarLineas(); }));
  cont.querySelectorAll('.l-cant').forEach(s => s.addEventListener('input', e => { f.lineas[e.target.dataset.i].cantidad = e.target.value; f.tocado = true; pintarTotales(); }));
  cont.querySelectorAll('.l-cant').forEach(s => s.addEventListener('change', () => pintarLineas()));
  cont.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => { f.lineas.splice(Number(b.dataset.quitar), 1); if (!f.lineas.length) f.lineas.push({ productoId: '', cantidad: '' }); f.tocado = true; pintarLineas(); }));
  pintarTotales();
}
function pintarTotales() {
  const t = M.totales(lineasDelForm()), el = $('f-totales'); if (!el) return;
  el.innerHTML = `<span>Neto ${pesos(t.neto)} · IVA ${pesos(t.iva)}</span><b>Total ${pesos(t.total)}</b>`;
}

async function guardar() {
  const f = E.form, btn = $('f-guardar'), err = $('f-error'); err.textContent = '';
  const cli = cliente(f.clienteId);
  if (!f.fecha) { err.textContent = 'Elige la fecha.'; return; }
  if (!cli) { err.textContent = 'Elige el cliente.'; return; }
  if (f.lineas.some(l => l.productoId && !(Number(l.cantidad) > 0))) { err.textContent = 'Revisa las cantidades: cada producto necesita una cantidad mayor que 0.'; return; }
  if (f.lineas.some(l => Number(l.cantidad) > 0 && !l.productoId)) { err.textContent = 'Hay una cantidad sin producto.'; return; }
  const lineas = lineasDelForm();
  if (!lineas.length) { err.textContent = 'Agrega al menos un producto.'; return; }
  if (lineas.some(l => !(l.precio > 0))) { err.textContent = 'Un producto no tiene precio para este cliente. Pide el precio en Solicitudes.'; return; }
  if (f.editando && f.motivo.trim().length < 3) { err.textContent = 'Escribe el motivo de la edición.'; return; }
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    if (f.editando) await guardarEdicion(f, cli, lineas);
    else await guardarNueva(f, cli, lineas);
  } catch (e) { err.textContent = mensajeError(e); }
  btn.disabled = false; btn.textContent = f.editando ? 'Guardar cambios' : 'Guardar orden';
}
async function guardarNueva(f, cli, lineas) {
  const ref = doc(db, 'contadores', 'ordenes');
  const orden = await runTransaction(db, async tx => {
    const c = await tx.get(ref);
    if (!c.exists()) throw new Error('Falta el contador de órdenes en la base nueva. Avísale a Emmanuel.');
    const n = Number(c.data().siguiente);
    const oref = doc(db, 'ordenes', String(n));
    if ((await tx.get(oref)).exists()) throw new Error(`La orden N° ${n} ya existe. Avísale a Emmanuel.`);
    const o = M.armarOrden({ n, fecha: f.fecha, cliente: cli, lineas, obs: f.obs, correo: E.user.email, ts: serverTimestamp() });
    tx.update(ref, { siguiente: n + 1, en: serverTimestamp() });
    tx.set(oref, o);
    return o;
  });
  E.form = formVacio();
  pintarNueva();
  avisar(`Orden N° ${orden.n} guardada`);
  pasarAPlanilla();
  try { await Pdf.descargar(orden, cli); } catch (e) { avisar(`Orden N° ${orden.n} guardada. El PDF no se pudo hacer (${e.message}); descárgalo desde Órdenes.`, true); }
}
async function guardarEdicion(f, cli, lineas) {
  const n = f.editando.n, oref = doc(db, 'ordenes', String(n));
  const r = await runTransaction(db, async tx => {
    const sn = await tx.get(oref);
    if (!sn.exists()) throw new Error('La orden ya no existe.');
    const antes = sn.data();
    if (!M.editable(antes)) throw new Error('Esta orden ya tiene folio, pago o está anulada: ya no se puede editar aquí.');
    const nueva = { ...antes, ...M.armarOrden({ n, fecha: f.fecha, cliente: cli, lineas, obs: f.obs, creada: antes.creada === undefined ? null : antes.creada }), revisar: antes.revisar || [], extra: antes.extra || {}, origen: antes.origen || { app: 'logistica' } };
    nueva.editada = { por: E.user.email, en: serverTimestamp(), veces: ((antes.editada && antes.editada.veces) || 0) + 1 };
    const resumen = M.resumenCambios(antes, nueva) || 'Sin cambios en productos';
    tx.set(oref, nueva);
    tx.set(doc(collection(db, 'ediciones')), { n, fecha: M.ahoraTexto(), motivo: f.motivo.trim(), resumen, cambios: JSON.stringify({ antes: antes.lineas, despues: lineas }), por: E.user.email, en: serverTimestamp(), planillaPendiente: false });
    return { nueva, originales: M.cantidades(antes), resumen };
  });
  E.form = formVacio();
  avisar(`Orden N° ${n} actualizada`);
  location.hash = '#ordenes';
  pasarAPlanilla();
  try {
    let eds = [];
    try { eds = (await getDocs(query(collection(db, 'ediciones'), where('n', '==', n)))).docs.map(d => d.data()).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))); } catch (e) {}
    if (!eds.length) eds = [{ fecha: M.ahoraTexto(), motivo: f.motivo.trim(), resumen: r.resumen }];
    const orig = M.originalesDe(eds);
    await Pdf.descargar(r.nueva, cli, Object.keys(orig).length ? orig : r.originales, eds);
  } catch (e) { avisar(`Orden actualizada. El PDF no se pudo hacer (${e.message}).`, true); }
}
function editar(o) {
  E.form = { editando: { n: o.n }, fecha: o.fecha, clienteId: o.clienteId || '', obs: o.obs || '', motivo: '', tocado: true,
    // Una línea copiada de la planilla puede no tener el id del producto: se busca por nombre;
    // si no está en el catálogo, se mantiene tal cual (nombre y precio de la orden)
    lineas: o.lineas.map(l => {
      const p = (l.productoId && producto(l.productoId)) || E.productos.find(x => M.clave(x.nombre) === M.clave(l.producto));
      return { productoId: p ? p.id : 'nombre:' + l.producto, nombre: l.producto, cantidad: String(l.cantidad), precioFijo: l.precio, foto: M.fotoDe(l) };
    }) };
  location.hash = '#nueva';
  if (vistaDesdeHash() === 'nueva') pintarNueva();
}

// ── v1.4.0 · Cobros en efectivo: marcar los clientes que pagaron; llega a Sistema Fën → Efectivo → Por recibir ──
function pintarCobros() {
  const C = E.cobros; if (!C.fecha) C.fecha = M.hoy();
  if (C.guardando) return;
  const filas = M.cobrosDelDia(E.ordenes.values(), C.fecha);
  [...C.sel].forEach(k => { if (!filas.some(f => f.clave === k && f.estado === 'por_cobrar')) C.sel.delete(k); });
  const elegidas = filas.filter(f => C.sel.has(f.clave)), suma = elegidas.reduce((s, f) => s + f.efectivo, 0);
  const nOrd = f => `${f.ordenes.length} ${f.ordenes.length === 1 ? 'orden' : 'órdenes'} · N° ${f.ordenes.map(o => o.n).join(', ')}`;
  const fila = f => f.estado === 'por_cobrar'
    ? `<label class="cobro"><input type="checkbox" data-cobro="${esc(f.clave)}" ${C.sel.has(f.clave) ? 'checked' : ''}><span class="cobro-t"><b>${esc(f.cliente)}</b><small>${nOrd(f)} · total ${pesos(f.total)} · ${M.textoRedondeo(f.redondeo)}</small></span><b class="cobro-m">${pesos(f.efectivo)}</b></label>`
    : `<div class="cobro cobro-listo"><span class="cobro-ok" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg></span><span class="cobro-t"><b>${esc(f.cliente)}</b><small class="ok-texto">${f.estado === 'logistica' ? `Pagado en efectivo${f.hora ? ' · ' + esc(f.hora) : ''}${f.redondeo ? ' · total ' + pesos(f.total) + ', ' + M.textoRedondeo(f.redondeo) : ''}` : f.estado === 'recibido' ? 'Pagado · ya recibido por Emmanuel' : 'Pagado (anotado en Sistema Fën)'}</small></span>
        <span class="cobro-der"><b class="cobro-m">${pesos(f.efectivo)}</b>${f.estado === 'logistica' ? `<button type="button" class="btn-sec btn-chico" data-deshacer="${esc(f.cobroId)}">Deshacer</button>` : ''}</span></div>`;
  $('v-cobros').innerHTML = `<h1 id="t-cobros">Cobros en efectivo</h1>
    <div class="campo"><label for="c-fecha">Fecha de las órdenes</label><input id="c-fecha" type="date" value="${esc(C.fecha)}" max="${M.hoy()}"></div>
    <p class="ayuda">Marque los clientes que le pagaron en efectivo. El monto a cobrar ya viene redondeado a la decena, como en la caja. Solo aparecen las órdenes sin folio.</p>
    <div class="tarjeta lista-cobros">${filas.length ? filas.map(fila).join('') : `<div class="vacio">No hay órdenes sin folio del ${diaCorto(C.fecha)}.</div>`}</div>
    ${elegidas.length ? `<div class="cobro-suma"><span>Marcados: ${elegidas.length} ${elegidas.length === 1 ? 'cliente' : 'clientes'}</span><b>${pesos(suma)}</b></div>` : ''}
    <button type="button" class="btn btn-ancho" id="c-pagado" ${elegidas.length && E.cfg.activa ? '' : 'disabled'}>Pagado${elegidas.length ? ' (' + pesos(suma) + ')' : ''}</button>
    <p class="ayuda">Al presionar Pagado, las órdenes quedan pagadas y el efectivo le llega a Emmanuel para recibirlo. "Deshacer" sirve si se marcó por error, mientras Emmanuel no lo haya recibido.</p>
    ${htmlSobre()}`;
  $('c-fecha').addEventListener('change', e => { C.fecha = e.target.value && e.target.value <= M.hoy() ? e.target.value : M.hoy(); C.sel.clear(); pintarCobros(); });
  document.querySelectorAll('[data-cobro]').forEach(x => x.addEventListener('change', () => { if (x.checked) C.sel.add(x.dataset.cobro); else C.sel.delete(x.dataset.cobro); pintarCobros(); }));
  const bp = $('c-pagado'); if (bp) bp.addEventListener('click', () => marcarPagados(elegidas, bp));
  document.querySelectorAll('[data-deshacer]').forEach(b => b.addEventListener('click', () => deshacerCobro(b.dataset.deshacer, b)));
  conectarSobre();
}

// ── v1.5.0 · El sobre de hoy: lo cobrado hoy, los gastos hechos con esa plata y lo que se entrega; la etiqueta de 80 × 50 mm ──
const quienSoy = () => { const c = String((E.user && E.user.email) || '').split('@')[0].replace(/[._+-]+/g, ' ').trim(); return c ? c.charAt(0).toUpperCase() + c.slice(1) : ''; };
function sobreHoy() {
  const dia = M.hoy(), cobros = M.cobrosPagadosEl(E.ordenes.values(), dia);
  const gastos = E.gastos.filter(g => g.fecha === dia && !g.anulado).sort((a, b) => String(a.en || '').localeCompare(String(b.en || '')));
  return { dia, cobros, gastos, s: M.sobreDelDia(cobros, gastos) };
}
function htmlSobre() {
  const { dia, gastos, s } = sobreHoy();
  const fila = g => `<div class="gasto"><span class="cobro-t"><b>${esc(M.textoGasto(g))}</b><small>${g.boleta ? 'con boleta (va en el sobre)' : 'sin boleta'}${g.pendienteAdmin ? '' : ' · ya recibido por Emmanuel'}</small></span>
      <span class="cobro-der"><b class="cobro-m">−${pesos(g.monto)}</b>${g.pendienteAdmin ? `<button type="button" class="btn-sec btn-chico" data-quitar-gasto="${esc(g.id)}">Quitar</button>` : ''}</span></div>`;
  return `<h2 class="sub-sobre" id="t-sobre">Sobre de hoy · ${esc(diaCorto(dia))}</h2>
    <div class="tarjeta lista-cobros sobre" aria-labelledby="t-sobre">
      <div class="cobro"><span class="cobro-t"><b>Cobrado hoy</b><small>${s.nClientes} ${s.nClientes === 1 ? 'cliente' : 'clientes'}</small></span><b class="cobro-m">${pesos(s.cobrado)}</b></div>
      <div class="gastos-cab"><b>Gastos con esta plata</b><button type="button" class="btn-sec" id="g-nuevo" ${E.cfg.activa ? '' : 'disabled'}>+ Gasto</button></div>
      ${gastos.length ? gastos.map(fila).join('') : '<p class="ayuda">Sin gastos hoy. Si pagó estacionamiento o una compra chica con la plata de los cobros, anótelo con "+ Gasto".</p>'}
      <div class="entrega"><span><b>Entrega en el sobre</b><small>${pesos(s.cobrado)}${s.gastos ? ' − ' + pesos(s.gastos) : ''}</small></span><b>${pesos(s.entrega)}</b></div>
    </div>
    <button type="button" class="btn btn-ancho" id="s-etiqueta" ${s.nClientes || s.nGastos ? '' : 'disabled'}>Imprimir etiqueta del sobre</button>
    <p class="ayuda">Imprime directo en la impresora de etiquetas por Bluetooth: la primera vez del día, elija "BlueTooth Printer" en la lista (y cierre la app Print Label si está abierta). Si no imprime, <button type="button" class="btn-link" id="s-etiqueta-img">compártala con Print Label</button>. Si le dieron boleta, póngala dentro del sobre.</p>`;
}
function conectarSobre() {
  const datos = () => { const { dia, s } = sobreHoy(); return { d: M.etiquetaSobre(s, dia, quienSoy()), nombre: `sobre-logistica-${dia}` }; };
  // Directo por Bluetooth (Chrome en Android); si el equipo no puede, Compartir
  const b = $('s-etiqueta');
  if (b) b.addEventListener('click', () => {
    const { d, nombre } = datos();
    if (!Et.puedeDirecto()) { Et.compartir(d, nombre).then(r => { if (r === 'descargada') avisar('La etiqueta quedó en Descargas: ábrala con la app Print Label.'); }); return; }
    b.disabled = true; b.textContent = 'Imprimiendo…';
    Et.imprimirDirecto(d).then(() => avisar('Etiqueta impresa.'), e => avisar(e.message, true))
      .finally(() => { b.disabled = false; b.textContent = 'Imprimir etiqueta del sobre'; });
  });
  const bi = $('s-etiqueta-img');
  if (bi) bi.addEventListener('click', () => { const { d, nombre } = datos(); Et.compartir(d, nombre, { como: 'png' }).then(r => { if (r === 'descargada') avisar('La etiqueta quedó en Descargas: ábrala con la app Print Label.'); }); });
  const n = $('g-nuevo'); if (n) n.addEventListener('click', dialogoGasto);
  document.querySelectorAll('[data-quitar-gasto]').forEach(x => x.addEventListener('click', () => quitarGasto(x.dataset.quitarGasto, x)));
}
function dialogoGasto() {
  const d = document.createElement('dialog');
  d.className = 'dialogo'; d.setAttribute('aria-labelledby', 'g-tit');
  d.innerHTML = `<form method="dialog" class="form-gasto" novalidate>
    <h2 id="g-tit">Gasto con la plata de los cobros</h2>
    <div class="campo"><label for="g-monto">Monto</label><input id="g-monto" inputmode="numeric" autocomplete="off" placeholder="$"></div>
    <fieldset class="opciones"><legend>¿En qué?</legend>
      ${Object.entries(M.QUE_GASTO).map(([k, t], i) => `<label class="opcion"><input type="radio" name="g-que" value="${k}" ${i === 0 ? 'checked' : ''}>${esc(t)}</label>`).join('')}</fieldset>
    <div class="campo"><label for="g-det">Detalle <span id="g-det-opc">(opcional)</span></label><input id="g-det" maxlength="120" placeholder="Por ejemplo: bolsas, cinta, hielo"></div>
    <fieldset class="opciones"><legend>¿Le dieron boleta?</legend>
      <label class="opcion"><input type="radio" name="g-bol" value="si">Sí, va en el sobre</label>
      <label class="opcion"><input type="radio" name="g-bol" value="no">No</label></fieldset>
    <div class="error" id="g-err" role="alert"></div>
    <div class="botones"><button type="button" class="btn-sec" id="g-no">Cancelar</button><button type="submit" class="btn" id="g-si">Guardar gasto</button></div>
  </form>`;
  document.body.appendChild(d);
  const cerrar = () => { d.close(); d.remove(); };
  d.addEventListener('cancel', ev => { ev.preventDefault(); cerrar(); });
  d.querySelector('#g-no').onclick = cerrar;
  const opc = () => { d.querySelector('#g-det-opc').textContent = d.querySelector('[name="g-que"]:checked').value === 'otro' ? '(obligatorio)' : '(opcional)'; };
  d.querySelectorAll('[name="g-que"]').forEach(r => r.addEventListener('change', opc));
  d.querySelector('#g-monto').addEventListener('input', ev => { const n = M.leerMonto(ev.target.value); ev.target.value = n > 0 ? '$' + n.toLocaleString('es-CL') : ''; });
  d.querySelector('form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = d.querySelector('#g-err'), b = d.querySelector('#g-si'); err.textContent = '';
    const bol = d.querySelector('[name="g-bol"]:checked');
    let g;
    try { g = M.armarGasto({ monto: d.querySelector('#g-monto').value, que: d.querySelector('[name="g-que"]:checked').value, detalle: d.querySelector('#g-det').value, boleta: bol ? bol.value === 'si' : null, fecha: M.hoy(), correo: E.user.email, en: M.ahoraTexto() }); }
    catch (e) { err.textContent = e.message; return; }
    b.disabled = true; b.textContent = 'Guardando…';
    try {
      await addDoc(collection(db, 'gastos_logistica'), { ...g, creado: serverTimestamp() });
      cerrar(); avisar(`Gasto anotado: ${M.textoGasto(g)} ${pesos(g.monto)}.`);
    } catch (e) { err.textContent = mensajeError(e); b.disabled = false; b.textContent = 'Guardar gasto'; }
  });
  d.showModal();
  setTimeout(() => d.querySelector('#g-monto').focus(), 0);
}
async function quitarGasto(id, b) {
  const g = E.gastos.find(x => x.id === id);
  if (!g || !confirm(`¿Quitar el gasto "${M.textoGasto(g)}" de ${pesos(g.monto)}?`)) return;
  b.disabled = true;
  try { await updateDoc(doc(db, 'gastos_logistica', id), { anulado: true, pendienteAdmin: false, anuladoEn: serverTimestamp() }); avisar('Gasto quitado.'); }
  catch (e) { b.disabled = false; avisar(/permission/.test((e && e.code) || '') ? 'Emmanuel ya lo recibió: ya no se puede quitar aquí. Avísele.' : mensajeError(e), true); }
}
// Cada cliente marcado = un cobro: sus órdenes pendientes quedan pagadas en una sola transacción
async function marcarPagados(lista, b) {
  if (!lista.length) return;
  const C = E.cobros, total = lista.reduce((s, f) => s + f.efectivo, 0);
  if (!confirm(`¿Marcar como pagados en efectivo?\n\n${lista.map(f => `${f.cliente}: ${pesos(f.efectivo)}`).join('\n')}\n\nTotal ${pesos(total)}`)) return;
  b.disabled = true; b.textContent = 'Guardando…'; C.guardando = true;
  let ok = 0; const fallas = [];
  for (const f of lista) {
    const cobroId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ns = f.ordenes.map(o => o.n), en = M.ahoraTexto();
    try {
      await runTransaction(db, async tx => {
        const refs = f.ordenes.map(o => doc(db, 'ordenes', String(o.n))), sns = [];
        for (const r of refs) sns.push(await tx.get(r));
        sns.forEach(sn => { if (!sn.exists() || !M.cobrable(sn.data())) throw new Error(`La orden N° ${sn.id} cambió (ya tiene pago, folio o se anuló). Revise la lista.`); });
        sns.forEach((sn, i) => tx.update(refs[i], M.pagoDeLogistica(sn.data(), { cobroId, fecha: M.hoy(), correo: E.user.email, en, efectivo: f.efectivo, total: f.total, ns })));
      });
      ok++; C.sel.delete(f.clave);
    } catch (e) { fallas.push(`${f.cliente}: ${mensajeError(e)}`); }
  }
  C.guardando = false;
  if (ok) avisar(`Listo: ${ok} ${ok === 1 ? 'cliente pagado' : 'clientes pagados'}. Le llega a Emmanuel en Efectivo → Por recibir.`);
  if (fallas.length) avisar(fallas.join(' · '), true);
  pintarCobros();
}
async function deshacerCobro(cobroId, b) {
  const ords = [...E.ordenes.values()].filter(o => o.pagoOrden && o.pagoOrden.cobroId === cobroId);
  if (!ords.length || !confirm(`¿Deshacer el cobro de ${ords[0].cliente}? Las órdenes vuelven a quedar sin pagar.`)) return;
  b.disabled = true;
  try {
    await runTransaction(db, async tx => {
      const refs = ords.map(o => doc(db, 'ordenes', String(o.n))), sns = [];
      for (const r of refs) sns.push(await tx.get(r));
      sns.forEach(sn => { const p = sn.exists() && sn.data().pagoOrden; if (!p || p.cobroId !== cobroId || !p.pendienteAdmin) throw new Error('Emmanuel ya lo recibió: ya no se puede deshacer aquí. Avísele.'); });
      refs.forEach(r => tx.update(r, { estadoPago: 'PENDIENTE', fechaPago: null, medioPago: null, pagoOrden: null }));
    });
    avisar('Cobro deshecho: las órdenes quedan sin pagar.');
  } catch (e) { b.disabled = false; avisar(mensajeError(e), true); }
}

// ── Órdenes ────────────────────────────────────────
function pintarOrdenes() {
  const q = M.clave(E.filtro);
  const lista = [...E.ordenes.values()].filter(o => !o.quitadoEnPlanilla)
    .filter(o => !E.soloSinFolio || o.sinFolio)
    .filter(o => !q || M.clave(o.cliente).includes(q) || String(o.n).includes(q))
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || b.n - a.n);   // por fecha de la orden, la más reciente arriba
  const chips = o => [o.estado === 'anulada' ? '<span class="chip c-rojo">Anulada</span>' : '',
    o.folio ? `<span class="chip c-azul">Folio ${esc(o.folio)}</span>` : '<span class="chip c-gris">Sin folio</span>',
    /PAGADO/.test(o.estadoPago) ? '<span class="chip c-verde">Pagada</span>' : '',
    ''].join('');   // v1.3.0: sin "Por pasar a la planilla" (la copia está apagada)
  $('v-ordenes').innerHTML = `<h1 id="t-ordenes">Órdenes</h1>
    <div class="filtros"><div class="campo"><label for="o-buscar">Buscar cliente o N°</label><input id="o-buscar" value="${esc(E.filtro)}" placeholder="Ej: Oveja o 2580"></div>
      <label class="check"><input type="checkbox" id="o-sinfolio" ${E.soloSinFolio ? 'checked' : ''}> Solo sin folio</label></div>
    <p class="ayuda">Últimos ${F.DIAS_LISTA} días y todas las que no tienen folio · ${lista.length} ${lista.length === 1 ? 'orden' : 'órdenes'}</p>
    <div class="tarjeta" id="o-lista">${lista.map(o => `<details class="orden" data-n="${o.n}"><summary><div class="txt"><b>N° ${o.n} · ${esc(o.cliente)}</b><span>${diaCorto(o.fecha)} · ${pesos(o.total)} · ${(o.lineas || []).length} ${(o.lineas || []).length === 1 ? 'producto' : 'productos'}</span></div><div class="chips">${chips(o)}</div></summary>
      <table class="tabla"><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Neto</th></tr></thead><tbody>${(o.lineas || []).map(l => `<tr><td>${esc(l.producto)}</td><td class="num">${l.cantidad}</td><td class="num">${pesos(l.precio)}</td><td class="num">${pesos(l.neto)}</td></tr>`).join('')}</tbody></table>
      <p class="ayuda" style="margin:8px 0">Neto ${pesos(o.neto)} · IVA ${pesos(o.iva)} · <b>Total ${pesos(o.total)}</b>${o.obs ? ' · ' + esc(o.obs) : ''}${o.editada ? ` · editada ${o.editada.veces} ${o.editada.veces === 1 ? 'vez' : 'veces'}` : ''}</p>
      ${o.estado === 'anulada' ? `<p class="ayuda" style="margin:0 0 8px;color:var(--rojo-t)"><b>Anulada</b>${o.anulada && o.anulada.motivo ? ': ' + esc(o.anulada.motivo) : ''}</p>` : ''}
      <div class="botones" style="padding-bottom:12px"><button type="button" class="btn-sec" data-pdf="${o.n}">${o.estado === 'anulada' ? 'PDF (marcado ANULADA)' : 'Descargar PDF'}</button>${o.estado !== 'anulada' ? `<button type="button" class="btn-sec btn-wsp" data-wsp="${o.n}">Enviar por WhatsApp</button>` : ''}${M.editable(o) && E.cfg.activa ? `<button type="button" class="btn-sec" data-editar="${o.n}">Editar</button>` : ''}${o.estado !== 'anulada' && E.cfg.activa ? (anulacionPedida(o.n) ? '<span class="chip c-amarillo" style="align-self:center">Anulación pedida</span>' : `<button type="button" class="btn-sec btn-peligro" data-pedir-anular="${o.n}">Solicitar anulación</button>`) : ''}</div>
    </details>`).join('') || '<div class="vacio">No hay órdenes con eso.</div>'}</div>`;
  $('o-buscar').addEventListener('input', e => { E.filtro = e.target.value; const p = e.target.selectionStart; pintarOrdenes(); const i = $('o-buscar'); i.focus(); i.setSelectionRange(p, p); });
  $('o-sinfolio').addEventListener('change', e => { E.soloSinFolio = e.target.checked; pintarOrdenes(); });
  document.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editar(E.ordenes.get(b.dataset.editar))));
  document.querySelectorAll('[data-pedir-anular]').forEach(b => b.addEventListener('click', async () => {
    const o = E.ordenes.get(b.dataset.pedirAnular);
    const motivo = (prompt(`Solicitar anulación de la orden N° ${o.n} (${o.cliente}, ${pesos(o.total)}).\n\n¿Por qué se anula?`) || '').trim();
    if (!motivo) return;
    if (motivo.length < 3) { avisar('Escribe un motivo un poco más claro.', true); return; }
    b.disabled = true;
    try {
      await addDoc(collection(db, 'solicitudes'), { tipo: 'anulacion', n: o.n, clienteId: o.clienteId || null, cliente: o.cliente, productoId: null, producto: `Orden N° ${o.n}`, precio: o.total, nota: motivo, estado: 'pendiente', por: E.user.email, en: serverTimestamp(), respuesta: null });
      avisar('Anulación solicitada: le llega a Emmanuel');
    } catch (e) { avisar(mensajeError(e), true); b.disabled = false; }
  }));
  document.querySelectorAll('[data-wsp]').forEach(b => b.addEventListener('click', async () => {
    const o = E.ordenes.get(b.dataset.wsp), cli = cliente(o.clienteId) || { nombre: o.cliente };
    const yaListo = b.dataset.listo === '1';
    b.disabled = true; if (!yaListo) b.textContent = 'Preparando…';
    let r;
    try { r = await enviarWsp(b, o, cli); } catch (e) { avisar('No se pudo enviar: ' + (e.message || e), true); }
    b.disabled = false;
    if (r !== 'otra') { b.textContent = 'Enviar por WhatsApp'; delete b.dataset.listo; }
  }));
  document.querySelectorAll('[data-pdf]').forEach(b => b.addEventListener('click', async () => {
    const o = E.ordenes.get(b.dataset.pdf), cli = cliente(o.clienteId) || { nombre: o.cliente };
    b.disabled = true; b.textContent = 'Generando…';
    try {
      let eds = [];
      if (o.editada) eds = (await getDocs(query(collection(db, 'ediciones'), where('n', '==', o.n)))).docs.map(d => d.data()).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
      await Pdf.descargar(o, cli, M.originalesDe(eds), eds);
    } catch (e) { avisar('No se pudo hacer el PDF: ' + e.message, true); }
    b.disabled = false; b.textContent = 'Descargar PDF';
  }));
}

// v1.2.0 · Enviar la orden por WhatsApp: en el celular se abre "Compartir" con el PDF y el mensaje (se elige el chat o grupo).
// Si el equipo no puede compartir archivos (computador), se descarga el PDF y se abre WhatsApp con el mensaje ya escrito.
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? `${Number(m[3])} de ${MESES_L[Number(m[2]) - 1]} de ${m[1]}` : String(f || ''); };
const mensajeOrden = o => `Hola, te enviamos la orden de venta N° ${o.n} del pedido del ${fechaLarga(o.fecha)}. Por favor revísala contra el pedido entregado y avísanos si falta algo o hay alguna diferencia. ¡Gracias! Panadería Fën`;
const listosWsp = new Map();   // orden → archivo ya hecho (si el celular pidió tocar de nuevo)
async function pdfDeOrden(o, cli) {
  let eds = [];
  if (o.editada) eds = (await getDocs(query(collection(db, 'ediciones'), where('n', '==', o.n)))).docs.map(d => d.data()).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return Pdf.descargar(o, cli, M.originalesDe(eds), eds, false, true);
}
async function enviarWsp(b, o, cli) {
  const texto = mensajeOrden(o);
  let listo = listosWsp.get(o.n);
  if (!listo) { const r = await pdfDeOrden(o, cli); listo = new File([r.blob], r.nombre, { type: 'application/pdf' }); }
  if (navigator.canShare && navigator.canShare({ files: [listo] })) {
    try { await navigator.share({ files: [listo], text: texto }); listosWsp.delete(o.n); return; }
    catch (e) {
      if (e && e.name === 'AbortError') { listosWsp.delete(o.n); return; }   // cerró el menú
      // El celular pide un toque nuevo (el PDF tardó): queda listo para el siguiente toque
      if (e && e.name === 'NotAllowedError') { listosWsp.set(o.n, listo); b.textContent = 'Tocar para enviar'; b.dataset.listo = '1'; return 'otra'; }
      throw e;
    }
  }
  // Computador: baja el PDF y abre WhatsApp con el mensaje (se adjunta el PDF a mano)
  const url = URL.createObjectURL(listo), a = document.createElement('a'); a.href = url; a.download = listo.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  const destino = cli.grupoWhatsapp ? null : cli.whatsapp;
  if (cli.grupoWhatsapp) { try { await navigator.clipboard.writeText(texto); } catch (e) {} window.open(cli.grupoWhatsapp, '_blank', 'noopener'); avisar('PDF descargado y mensaje copiado: en el grupo, pega el mensaje y adjunta el PDF'); }
  else { window.open(`https://wa.me/${destino || ''}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener'); avisar('PDF descargado: adjúntalo en el chat de WhatsApp que se abrió'); }
}
const anulacionPedida = n => E.solicitudes.some(s => s.tipo === 'anulacion' && s.n === Number(n) && s.estado === 'pendiente');
// ── Solicitudes ────────────────────────────────────
// v1.3.0: la lista de productos que se pueden pedir la publica el Catálogo de Sistema Fën en fen-b2b (config/catalogoDisponible):
// 1 lectura al abrir "Producto nuevo" (antes: la lista de recetas de la planilla, CSV). Necesita las reglas de fen-b2b v1.7.0.
async function cargarDisponible() {
  if (E.disponible) return E.disponible;
  let sn;
  try { sn = await getDoc(doc(db, 'config', 'catalogoDisponible')); }
  catch (e) { throw new Error(/permission/.test((e && e.code) || '') ? 'Falta que Emmanuel publique las reglas nuevas de fen-b2b (v1.7.0).' : 'No se pudo leer la lista del Catálogo.'); }
  E.disponible = sn.exists() ? (sn.data().productos || []) : [];
  return E.disponible;
}
const solForm = { tipo: 'precio', clienteId: '', productoId: '', catalogoId: '', precio: '', nota: '' };
function pintarSolicitudes() {
  const s = solForm;
  const estadoChip = x => x.estado === 'aprobada' ? '<span class="chip c-verde">Aprobada</span>' : x.estado === 'rechazada' ? '<span class="chip c-rojo">Rechazada</span>' : '<span class="chip c-amarillo">Pendiente</span>';
  $('v-solicitudes').innerHTML = `<h1 id="t-solicitudes">Solicitudes</h1>
    <p class="ayuda">Le llegan a Emmanuel en Sistema Fën. Cuando las apruebe, el precio o el producto aparecen solos al hacer órdenes.</p>
    <div class="tarjeta" style="display:flex;flex-direction:column;gap:12px">
      <div class="pastillas" role="group" aria-label="Tipo de solicitud">
        <button type="button" class="pastilla" data-tipo="precio" aria-pressed="${s.tipo === 'precio'}">Precio especial</button>
        <button type="button" class="pastilla" data-tipo="producto" aria-pressed="${s.tipo === 'producto'}">Producto nuevo del catálogo</button>
      </div>
      <div class="campo"><label for="s-cliente">Cliente${s.tipo === 'producto' ? ' (opcional: si es para un cliente)' : ''}</label><select id="s-cliente"><option value="">${s.tipo === 'producto' ? 'Para todos' : 'Elige…'}</option>${E.clientes.map(c => `<option value="${esc(c.id)}" ${c.id === s.clienteId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
      ${s.tipo === 'precio'
        ? `<div class="campo"><label for="s-producto">Producto</label><select id="s-producto"><option value="">Elige…</option>${E.productos.map(p => `<option value="${esc(p.id)}" ${p.id === s.productoId ? 'selected' : ''}>${esc(p.nombre)} · base ${pesos(p.precioBase)}</option>`).join('')}</select></div>`
        : `<div class="campo"><label for="s-catalogo">Producto del catálogo</label><select id="s-catalogo"><option value="">Cargando la lista…</option></select><span class="ayuda">Los productos de Fën que todavía no están en B2B.</span></div>`}
      <div class="campo"><label for="s-precio">Precio neto propuesto</label><input id="s-precio" type="number" inputmode="numeric" min="1" value="${esc(s.precio)}" placeholder="Ej: 2590"></div>
      <div class="campo"><label for="s-nota">Comentario</label><textarea id="s-nota" rows="2" placeholder="Ej: lo pidió el cliente para los fines de semana">${esc(s.nota)}</textarea></div>
      <div class="error" id="s-error" role="alert"></div>
      <button type="button" class="btn" id="s-enviar">Enviar solicitud</button>
    </div>
    <h2>Mis solicitudes</h2>
    <div class="tarjeta">${E.solicitudes.map(x => `<div class="orden" style="padding:10px 0"><div class="txt" style="display:flex;justify-content:space-between;gap:8px"><div><b>${x.tipo === 'precio' ? 'Precio: ' + esc(x.producto) : x.tipo === 'anulacion' ? 'Anular orden N° ' + esc(x.n) : 'Producto nuevo: ' + esc(x.producto)}</b><br><span class="ayuda">${x.cliente ? esc(x.cliente) + ' · ' : ''}${pesos(x.precio)}${x.nota ? ' · ' + esc(x.nota) : ''}</span>${x.respuesta ? `<br><span class="ayuda"><b>Respuesta:</b> ${esc(x.respuesta)}</span>` : ''}</div><div>${estadoChip(x)}</div></div></div>`).join('') || '<div class="vacio">Todavía no has enviado solicitudes.</div>'}</div>`;
  document.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => { s.tipo = b.dataset.tipo; pintarSolicitudes(); }));
  $('s-cliente').addEventListener('change', e => { s.clienteId = e.target.value; });
  if ($('s-producto')) $('s-producto').addEventListener('change', e => { s.productoId = e.target.value; });
  $('s-precio').addEventListener('input', e => { s.precio = e.target.value; });
  $('s-nota').addEventListener('input', e => { s.nota = e.target.value; });
  if (s.tipo === 'producto') cargarDisponible().then(rs => {
    const sel = $('s-catalogo'); if (!sel) return;
    const nuevas = M.disponibles(rs, E.productos, E.solicitudes);
    sel.innerHTML = `<option value="">${nuevas.length ? 'Elige…' : 'No hay productos nuevos en el catálogo'}</option>` + nuevas.map(r => `<option value="${esc(r.id)}" ${r.id === s.catalogoId ? 'selected' : ''}>${esc(r.nombre)}${r.area ? ' · ' + esc(AREAS[r.area] || r.area) : ''}</option>`).join('');
    sel.addEventListener('change', e => { s.catalogoId = e.target.value; });
  }).catch(e => { const sel = $('s-catalogo'); if (sel) sel.innerHTML = `<option value="">${esc(e.message)}</option>`; });
  $('s-enviar').addEventListener('click', async () => {
    const err = $('s-error'); err.textContent = '';
    const cli = cliente(s.clienteId), precio = Math.round(Number(s.precio) || 0);
    let datos;
    if (s.tipo === 'precio') {
      const p = producto(s.productoId);
      if (!cli) { err.textContent = 'Elige el cliente.'; return; }
      if (!p) { err.textContent = 'Elige el producto.'; return; }
      datos = { tipo: 'precio', clienteId: cli.id, cliente: cli.nombre, productoId: p.id, producto: p.nombre, idReceta: p.idReceta || null, area: p.area || null };
    } else {
      const r = (E.disponible || []).find(x => x.id === s.catalogoId);
      if (!r) { err.textContent = 'Elige el producto del catálogo.'; return; }
      datos = { tipo: 'producto', clienteId: cli ? cli.id : null, cliente: cli ? cli.nombre : null, productoId: null, producto: r.nombre, catalogoId: r.id, idReceta: null, area: r.area || null };
    }
    if (!(precio > 0)) { err.textContent = 'Escribe el precio neto propuesto.'; return; }
    const b = $('s-enviar'); b.disabled = true; b.textContent = 'Enviando…';
    try {
      await addDoc(collection(db, 'solicitudes'), { ...datos, precio, nota: s.nota.trim(), estado: 'pendiente', por: E.user.email, en: serverTimestamp(), respuesta: null });
      Object.assign(s, { productoId: '', catalogoId: '', precio: '', nota: '' });
      avisar('Solicitud enviada');
      pintarSolicitudes();
    } catch (e) { err.textContent = mensajeError(e); b.disabled = false; b.textContent = 'Enviar solicitud'; }
  });
}
