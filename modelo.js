// ═══════════════════════════════════════════════
//  fën · Órdenes B2B (logística) — cálculos  v1.0.0
//  Funciones puras: precios, totales, qué se puede editar y el resumen de una edición.
//  Mismos cálculos que la app B2B de siempre (IVA por línea y del total, redondeado).
// ═══════════════════════════════════════════════
export const clave = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const vigente = d => d && !d.quitadoEnPlanilla && d.estado !== 'archivado' && d.estado !== 'inactivo';

// Precio de un producto para un cliente: el especial si lo tiene, si no el precio base
export function precioPara(cliente, producto) {
  if (!producto) return { precio: 0, especial: false };
  const esp = ((cliente && cliente.precios) || []).find(p => (p.productoId && p.productoId === producto.id) || clave(p.producto) === clave(producto.nombre));
  if (esp && Number(esp.precio) > 0) return { precio: Number(esp.precio), especial: true };
  return { precio: Number(producto.precioBase) || 0, especial: false };
}

export function linea(producto, cantidad, precio) {
  const c = Number(cantidad) || 0, p = Math.round(Number(precio) || 0);
  const neto = c * p, iva = Math.round(neto * 0.19);
  return { producto: producto.nombre, productoId: producto.id || null, cantidad: c, precio: p, neto, iva, total: neto + iva };
}
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
    creada: creada !== undefined ? creada : { por: correo, en: ts }, planillaPendiente: true
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

// Recetas de Producción que todavía no son producto B2B (por ID de receta o por nombre)
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
