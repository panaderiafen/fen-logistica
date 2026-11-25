// ═══════════════════════════════════════════════
//  fën · Órdenes B2B (logística) — cálculos  v1.3.0 (foto de la venta y lista del Catálogo) · v1.3.1 (precio especial por ID)
//  Funciones puras: precios, totales, qué se puede editar y el resumen de una edición.
//  Mismos cálculos que la app B2B de siempre (IVA por línea y del total, redondeado).
// ═══════════════════════════════════════════════
export const clave = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const vigente = d => d && !d.quitadoEnPlanilla && d.estado !== 'archivado' && d.estado !== 'inactivo';

// Precio de un producto para un cliente: el especial si lo tiene, si no el precio base.
// v1.3.1: el precio especial va pegado al ID del producto (clientes.precios[].productoId, Sistema Fën v0.75.0). Por el nombre solo un
// precio antiguo que todavía no tiene ID (el mismo criterio que b2b-modelo.precioEsDe de Sistema Fën).
export const precioEsDe = (p, producto) => !!p && !!producto && (String(p.productoId || '').trim() ? String(p.productoId).trim() === String(producto.id || '').trim() : clave(p.producto) === clave(producto.nombre));
export function precioPara(cliente, producto) {
  if (!producto) return { precio: 0, especial: false };
  const esp = ((cliente && cliente.precios) || []).find(p => precioEsDe(p, producto));
  if (esp && Number(esp.precio) > 0) return { precio: Number(esp.precio), especial: true };
  return { precio: Number(producto.precioBase) || 0, especial: false };
}

// v1.3.0 · La foto de la venta: lo que el Catálogo de Sistema Fën dice del producto AL CREAR la orden (su ID del catálogo, de dónde sale,
// su área y su receta o reventa). Así Finanzas y el Plan de Panadería saben qué se vendió aunque el producto cambie después.
// Igual que catalogo-productos-modelo.js → fotoLinea de Sistema Fën (el producto de fen-b2b trae catalogoId, tipo, idReceta, area, reventaId).
export function fotoLinea(producto) {
  if (!producto || !String(producto.catalogoId || '').trim()) return null;
  const tipo = String(producto.tipo || '').trim();
  return { catalogoId: String(producto.catalogoId).trim(), tipo, area: String(producto.area || '').trim(), recetaId: tipo === 'receta' ? String(producto.idReceta || '').trim() : '',
    reventaId: tipo === 'reventa' ? String(producto.reventaId || producto.idReceta || '').trim() : '', unidadesPorVenta: 1 };
}
// foto: la de la línea original al editar (si el producto es el mismo, se conserva: la venta guarda su foto)
export function linea(producto, cantidad, precio, foto) {
  const c = Number(cantidad) || 0, p = Math.round(Number(precio) || 0);
  const neto = c * p, iva = Math.round(neto * 0.19);
  const f = foto && foto.catalogoId ? foto : fotoLinea(producto);
  return { producto: producto.nombre, productoId: producto.id || null, cantidad: c, precio: p, neto, iva, total: neto + iva, ...(f || {}) };
}
export const fotoDe = l => (l && l.catalogoId ? { catalogoId: l.catalogoId, tipo: l.tipo || '', area: l.area || '', recetaId: l.recetaId || '', reventaId: l.reventaId || '', unidadesPorVenta: Number(l.unidadesPorVenta) > 0 ? Number(l.unidadesPorVenta) : 1 } : null);
// Un mismo producto en dos líneas (con el mismo precio) queda en una sola, con las cantidades sumadas
export function juntarLineas(lineas) {
  const out = [];
  lineas.forEach(l => {
    const ya = out.find(x => x.precio === l.precio && ((x.productoId && x.productoId === l.productoId) || clave(x.producto) === clave(l.producto)));
    if (!ya) { out.push({ ...l }); return; }
    ya.cantidad += l.cantidad; ya.neto = ya.cantidad * ya.precio; ya.iva = Math.round(ya.neto * 0.19); ya.total = ya.neto + ya.iva;
  });
  return out;
}
// Cantidades antes de la primera edición (para el PDF: tachado → nuevo), sacadas del historial
export function originalesDe(ediciones) {
  const e = (ediciones || []).slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))[0];
  if (!e) return {};
  try { return cantidades({ lineas: JSON.parse(e.cambios || '{}').antes || [] }); } catch (x) { return {}; }
}
// Totales como addOrden: IVA del total redondeado una vez
export function totales(lineas) {
  const neto = lineas.reduce((s, l) => s + l.neto, 0), iva = Math.round(neto * 0.19);
  return { neto, iva, total: neto + iva };
}

export const hoy = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const ahoraTexto = (d = new Date()) => `${hoy(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// La orden que se guarda (lo que piden las reglas de fen-b2b para logística)
export function armarOrden({ n, fecha, cliente, lineas, obs, correo, creada, ts }) {
  const t = totales(lineas);
  return {
    n, fecha, mes: fecha.slice(0, 7), cliente: cliente.nombre, clienteId: cliente.id,
    lineas, neto: t.neto, iva: t.iva, total: t.total,
    estadoPago: 'PENDIENTE', fechaPago: null, folio: null, sinFolio: true, fechaFolio: null,
    obs: String(obs || '').trim(), archivada: false, estado: 'activa', extra: {}, revisar: [],
    origen: { app: 'logistica' }, quitadoEnPlanilla: false,
    // v1.3.0: la copia a la planilla está apagada (Sistema Fën v0.73.0): la orden ya no se marca para pasar a la planilla
    creada: creada !== undefined ? creada : { por: correo, en: ts }, planillaPendiente: false
  };
}

// Logística edita solo lo que no tiene folio ni pago y está activa
export const editable = o => !!o && !o.folio && (o.estadoPago || 'PENDIENTE') === 'PENDIENTE' && (o.estado || 'activa') === 'activa' && !o.archivada && !o.quitadoEnPlanilla;

// Resumen de una edición (como el historial de la app B2B): "Hogaza: 2 → 3"
export function resumenCambios(antes, despues) {
  const r = [];
  if (antes.cliente !== despues.cliente) r.push(`Cliente: ${antes.cliente} → ${despues.cliente}`);
  if (antes.fecha !== despues.fecha) r.push(`Fecha: ${antes.fecha} → ${despues.fecha}`);
  const a = {}, d = {};
  (antes.lineas || []).forEach(l => { a[l.producto] = (a[l.producto] || 0) + l.cantidad; });
  (despues.lineas || []).forEach(l => { d[l.producto] = (d[l.producto] || 0) + l.cantidad; });
  new Set([...Object.keys(a), ...Object.keys(d)]).forEach(p => {
    if ((a[p] || 0) !== (d[p] || 0)) r.push(`${p}: ${a[p] || 0} → ${d[p] || 0}`);
  });
  (despues.lineas || []).forEach(l => { const v = (antes.lineas || []).find(x => x.producto === l.producto); if (v && v.precio !== l.precio) r.push(`${l.producto}: precio $${v.precio} → $${l.precio}`); });
  if ((antes.obs || '') !== (despues.obs || '')) r.push('Notas cambiadas');
  return r.join('\n');
}
// Cantidades originales por producto (para el PDF: tachado → nuevo)
export const cantidades = o => (o.lineas || []).reduce((m, l) => { m[l.producto] = (m[l.producto] || 0) + l.cantidad; return m; }, {});

// v1.3.0 · Productos del Catálogo de Sistema Fën que todavía no están en B2B (fen-b2b config/catalogoDisponible, los publica Sistema Fën),
// sin los que ya pediste y siguen pendientes. Reemplaza a la lista de recetas de la planilla (CSV).
export function disponibles(lista, productos, solicitudes) {
  const enB2b = new Set((productos || []).map(p => p.catalogoId).filter(Boolean));
  const pedidos = new Set((solicitudes || []).filter(s => s.tipo === 'producto' && s.estado === 'pendiente' && s.catalogoId).map(s => s.catalogoId));
  return (lista || []).filter(x => x && x.id && !enB2b.has(x.id) && !pedidos.has(x.id)).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}
// (hasta la v1.2.1) Recetas de Producción que todavía no son producto B2B (por ID de receta o por nombre): ya no se usa
export function recetasNuevas(recetas, productos) {
  const ids = new Set(productos.map(p => p.idReceta).filter(Boolean)), nombres = new Set(productos.map(p => clave(p.nombre)));
  return recetas.filter(r => r.id && !ids.has(r.id) && !nombres.has(clave(r.nombre))).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
export function parseCSV(t) {
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i], sig = t[i + 1];
    if (q) { if (ch === '"' && sig === '"') { campo += '"'; i++; } else if (ch === '"') q = false; else campo += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && sig === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}
export function recetasDeCSV(texto) {
  const filas = parseCSV(texto);
  const h = (filas[0] || []).map(x => x.trim().toLowerCase());
  const col = (...n) => { for (const x of n) { const i = h.indexOf(x); if (i >= 0) return i; } return -1; };
  const iId = col('id_receta'), iNom = col('nombre'), iArea = col('área', 'area'), iCod = col('código_área', 'codigo_area');
  return filas.slice(1).filter(f => f[iId]).map(f => ({ id: (f[iId] || '').trim(), nombre: (f[iNom] || '').trim(), area: ((iArea >= 0 ? f[iArea] : '') || (iCod >= 0 ? f[iCod] : '') || '').trim() }));
}

// ── v1.4.0 · Cobros en efectivo (pedido por Emmanuel el 17 nov) ──
// El efectivo se redondea como en la caja (ley de redondeo): a la decena; termina en 1 a 5 baja, en 6 a 9 sube.
export function redondeoLey(total) {
  const t = Math.round(Number(total) || 0), r = ((t % 10) + 10) % 10;
  return r === 0 ? t : r <= 5 ? t - r : t + (10 - r);
}
// Una orden que logística puede marcar pagada: sin folio, pendiente, activa
export const cobrable = o => !!o && !o.folio && (o.estadoPago || 'PENDIENTE') === 'PENDIENTE' && (o.estado || 'activa') === 'activa' && !o.archivada && !o.quitadoEnPlanilla;
const deEseDia = (o, fecha) => o && o.fecha === fecha && !o.quitadoEnPlanilla && (o.estado || 'activa') === 'activa' && !o.archivada && !o.folio;
// Los cobros de un día: por cliente, lo pendiente en una fila (con su total y su redondeo), y cada cobro ya hecho en otra.
// → [{ clave, cliente, clienteId, estado: 'por_cobrar'|'logistica'|'recibido'|'pagado', ordenes, total, efectivo, redondeo, cobroId, hora }]
export function cobrosDelDia(ordenes, fecha) {
  const filas = [], porCli = new Map();
  [...ordenes].filter(o => deEseDia(o, fecha)).sort((a, b) => a.n - b.n).forEach(o => {
    const cli = o.clienteId || clave(o.cliente);
    if (cobrable(o)) { const k = 'p:' + cli; if (!porCli.has(k)) porCli.set(k, { clave: k, cliente: o.cliente, clienteId: o.clienteId || '', estado: 'por_cobrar', ordenes: [] }); porCli.get(k).ordenes.push(o); return; }
    const p = o.pagoOrden || {};
    if (p.logistica && p.cobroId) {
      const k = 'c:' + p.cobroId;
      if (!porCli.has(k)) porCli.set(k, { clave: k, cliente: o.cliente, clienteId: o.clienteId || '', estado: p.pendienteAdmin ? 'logistica' : 'recibido', ordenes: [], cobroId: p.cobroId, hora: String(p.en || '').slice(11, 16), efectivo: p.cobroEfectivo, redondeo: p.cobroRedondeo });
      porCli.get(k).ordenes.push(o); return;
    }
    if (/PAGADO/.test(String(o.estadoPago || ''))) { const k = 'o:' + o.n; porCli.set(k, { clave: k, cliente: o.cliente, clienteId: o.clienteId || '', estado: 'pagado', ordenes: [o] }); }
  });
  porCli.forEach(f => {
    f.total = f.ordenes.reduce((s, o) => s + Math.round(Number(o.total) || 0), 0);
    if (f.efectivo == null) f.efectivo = f.estado === 'pagado' ? f.total : redondeoLey(f.total);
    if (f.redondeo == null) f.redondeo = f.efectivo - f.total;
    filas.push(f);
  });
  const orden = { por_cobrar: 0, logistica: 1, recibido: 2, pagado: 2 };
  return filas.sort((a, b) => orden[a.estado] - orden[b.estado] || a.cliente.localeCompare(b.cliente, 'es'));
}
// El pago que logística deja en cada orden de un cobro (lo que piden las reglas de fen-b2b v1.9.0)
export function pagoDeLogistica(o, { cobroId, fecha, correo, en, efectivo, total, ns }) {
  return {
    estadoPago: 'PAGADO', fechaPago: fecha, medioPago: 'Efectivo · cobró logística',
    pagoOrden: { monto: Math.round(Number(o.total) || 0), fecha, medio: 'efectivo', cobro: 'logística', por: correo, en,
      logistica: true, pendienteAdmin: true, cobroId, cobroEfectivo: efectivo, cobroTotal: total, cobroRedondeo: efectivo - total, cobroNs: ns }
  };
}
export const textoRedondeo = r => (!r ? 'sin redondeo' : `redondeo ${r > 0 ? '+' : '−'}$${Math.abs(r).toLocaleString('es-CL')}`);

// ── v1.5.0 · Gastos con la plata de los cobros y el sobre del día (aprobado por Emmanuel el 25 nov, boceto "Etiquetas de sobres") ──
export const QUE_GASTO = { estacionamiento: 'Estacionamiento', compra: 'Compra chica', bencina: 'Bencina', otro: 'Otro' };
export const GASTO_MAX = 200000;
const limpio = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const leerMonto = v => { const t = String(v ?? '').replace(/[^\d]/g, ''); return t ? Number(t) : NaN; };
// El gasto que se guarda en fen-b2b (gastos_logistica). Lanza un error con el texto para la persona si algo falta.
export function armarGasto({ monto, que, detalle, boleta, fecha, correo, en }) {
  const m = leerMonto(monto);
  if (!(m > 0)) throw new Error('Escriba el monto del gasto.');
  if (m > GASTO_MAX) throw new Error(`Un gasto de más de $${GASTO_MAX.toLocaleString('es-CL')} no se anota aquí: avísele a Emmanuel.`);
  if (!QUE_GASTO[que]) throw new Error('Elija en qué se gastó.');
  const d = limpio(detalle, 120);
  if (que === 'otro' && d.length < 2) throw new Error('Escriba en qué se gastó.');
  if (boleta !== true && boleta !== false) throw new Error('Diga si le dieron boleta.');
  return { monto: m, que, detalle: d, boleta, fecha, por: correo, en, pendienteAdmin: true };
}
export const textoGasto = g => (g.detalle ? `${g.que === 'otro' ? '' : QUE_GASTO[g.que] + ': '}${g.detalle}` : QUE_GASTO[g.que] || 'Gasto');
// Los cobros que hizo logística un día (por la fecha del pago, no la de la orden), uno por cliente
export function cobrosPagadosEl(ordenes, dia) {
  const g = new Map();
  [...ordenes].forEach(o => {
    const p = o && o.pagoOrden;
    if (!p || !p.logistica || !p.cobroId || p.fecha !== dia || o.estado === 'anulada') return;
    if (!g.has(p.cobroId)) g.set(p.cobroId, { cobroId: p.cobroId, cliente: o.cliente || '', efectivo: Math.round(Number(p.cobroEfectivo) || 0) });
  });
  return [...g.values()];
}
// El sobre del día: lo cobrado menos los gastos vigentes → { cobrado, nClientes, gastos, nGastos, conBoleta, entrega }
export function sobreDelDia(cobros, gastos) {
  const vivos = (gastos || []).filter(x => x && !x.anulado);
  const cobrado = (cobros || []).reduce((s, c) => s + c.efectivo, 0), g = vivos.reduce((s, x) => s + Math.round(Number(x.monto) || 0), 0);
  return { cobrado, nClientes: (cobros || []).length, gastos: g, nGastos: vivos.length, conBoleta: vivos.filter(x => x.boleta).length, entrega: cobrado - g };
}
// Lo que va en la etiqueta de 80 × 50 mm (etiqueta.js)
const DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const fechaEtiqueta = dia => { const [y, m, d] = String(dia || '').split('-').map(Number); return y ? `${DIAS_C[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}` : ''; };
export function etiquetaSobre(s, dia, quien) {
  const p = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  const filas = [[`Cobrado (${s.nClientes} ${s.nClientes === 1 ? 'cliente' : 'clientes'})`, p(s.cobrado)]];
  if (s.nGastos) filas.push([`Gastos (${s.nGastos}${s.conBoleta ? `, ${s.conBoleta} con boleta` : ', sin boleta'})`, '−' + p(s.gastos)]);
  return { titulo: 'SOBRE · LOGÍSTICA', sub: fechaEtiqueta(dia), filas, total: ['ENTREGA', p(s.entrega)], pie: [`Cobró: ${String(quien || '').slice(0, 40)}`, 'Recibió: ___________'] };
}
