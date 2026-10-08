// ═══════════════════════════════════════════════
//  fën · Órdenes B2B — PDF de la orden de venta  v1.2.1 (diseño compacto, el mismo de Sistema Fën)
//  El mismo formato de la app B2B. Las librerías (html2canvas y jsPDF) se cargan
//  desde cdnjs solo la primera vez que se pide un PDF.
// ═══════════════════════════════════════════════
const CDN = { h2c: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' };
const cargados = {};
function script(url) {
  if (!cargados[url]) cargados[url] = new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = url; s.onload = ok;
    s.onerror = () => { delete cargados[url]; no(new Error('No se pudo cargar el generador de PDF (revisa internet).')); };
    document.head.appendChild(s);
  });
  return cargados[url];
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaES = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : (f || ''); };

// v0.15.2 · Diseño compacto (elegido el 7-oct): total grande arriba, productos en un recuadro, lectura fácil en el celular
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fechaLarga = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); if (!m) return f || ''; const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); const t = `${DIAS[d.getDay()]} ${fechaES(f)}`; return t.charAt(0).toUpperCase() + t.slice(1); };
const fechaCorta = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1].slice(0, 3)}` : esc(f || '—'); };
const pieEmpresa = E => `Fën · ${esc(E.direccion)} · ${esc(E.telefono)} · ${esc(E.correo)} · panaderiafen.cl`;
const cabecera = (titulo, sub) => `<div class="od-cab"><img class="od-logo" src="logo-orden.png" alt="Fën"><div><div class="od-t1">${titulo}</div><div class="od-t2">${sub}</div></div></div>`;
const banda = (etiqueta, valor, detalle) => `<div class="od-banda od-bloque"><div><div class="od-banda-et">${etiqueta}</div><div class="od-banda-v">${valor}</div></div><div class="od-banda-d">${detalle}</div></div>`;
const fila = (nombre, sub, valor, clase = '') => `<div class="od-fila od-bloque ${clase}"><div><div class="od-fila-n">${nombre}</div>${sub ? `<div class="od-fila-s">${sub}</div>` : ''}</div><div class="od-fila-v">${valor}</div></div>`;
const caja = (izq, der, cuerpo) => `<div class="od-caja"><div class="od-caja-cab od-bloque"><span>${izq}</span><span>${der}</span></div>${cuerpo}</div>`;
const estadoPagoTxt = e => { const x = String(e || 'PENDIENTE').toUpperCase(); return x.includes('PAGADO') ? 'Pagada' : x === 'PARCIAL' ? 'Pago parcial' : 'Pago pendiente'; };

// orden: { n, fecha, lineas, neto, iva, total, obs, folio, estadoPago }, cliente: { nombre, razonSocial, rut, direccion }
// originales: { producto: cantidad antes de editar } · ediciones: [{ fecha, motivo, resumen }]
export function html(orden, cliente, originales = {}, ediciones = []) {
  const E = (window.FEN_LOG || window.FEN_SIS).DATOS_EMPRESA;
  const num = String(orden.n).padStart(4, '0');
  // El cambio se compara por producto (total de sus líneas) y se muestra una vez, en su primera línea
  const ahora = {}, vistos = new Set();
  (orden.lineas || []).forEach(l => { ahora[l.producto] = (ahora[l.producto] || 0) + l.cantidad; });
  const cambio = (antes, despues) => {
    if (typeof antes === 'undefined' || antes === despues) return '';
    const d = Math.abs(antes - despues);
    return ` · <span class="od-cambio">${antes === 1 ? 'era' : 'eran'} ${antes}, se ${despues < antes ? (d === 1 ? 'devolvió' : 'devolvieron') : (d === 1 ? 'agregó' : 'agregaron')} ${d}</span>`;
  };
  const filas = (orden.lineas || []).map(l => {
    const primera = !vistos.has(l.producto); vistos.add(l.producto);
    return fila(esc(l.producto), `${esc(l.cantidad)} × ${clp(l.precio)}${primera ? cambio(originales[l.producto], ahora[l.producto]) : ''}`, clp(l.neto));
  }).join('') + Object.keys(originales).filter(p => !(p in ahora) && originales[p] > 0).map(p =>
    fila(esc(p), `<span class="od-cambio">${originales[p] === 1 ? 'era 1, se devolvió' : `eran ${originales[p]}, se devolvieron todos`}</span>`, '$0', 'od-quitado')).join('');
  const nProd = new Set((orden.lineas || []).map(l => l.producto)).size;
  const anulada = orden.estado === 'anulada', an = orden.anulada || {};
  const cambios = ediciones.map(e => `${esc(e.fecha)}: ${esc(e.resumen).replace(/\n/g, '; ')}${e.motivo ? ` ("${esc(e.motivo)}")` : ''}`);
  const notas = [orden.obs ? esc(orden.obs) : ''].concat(cambios).filter(Boolean);
  return `<div class="od${anulada ? ' od-anulada' : ''}">
  ${anulada ? `<div class="od-sello" aria-hidden="true">ANULADA</div><div class="od-franja">ORDEN ANULADA${an.en ? ' el ' + esc(an.en) : ''}${an.motivo ? ' · ' + esc(an.motivo) : ''} — no vale como pedido</div>` : ''}
  ${cabecera(`Orden de venta N° ${num}`, `${esc(fechaLarga(orden.fecha))} · ${esc(cliente.nombre || orden.cliente || '—')}`)}
  ${banda('Total con IVA', clp(orden.total), `Neto ${clp(orden.neto)} · IVA ${clp(orden.iva)}<br>${orden.folio ? 'Folio SII ' + esc(orden.folio) : 'Folio SII pendiente'} · ${anulada ? '<b style="color:#b42318">Anulada</b>' : estadoPagoTxt(orden.estadoPago)}`)}
  ${caja(`${nProd} ${nProd === 1 ? 'producto' : 'productos'}`, 'Neto', filas || fila('Sin productos', '', ''))}
  <div class="od-info od-bloque"><div><b>Cliente</b>${esc(cliente.razonSocial || cliente.nombre || orden.cliente || '')}<br>RUT ${esc(cliente.rut || '—')}${cliente.direccion ? '<br>' + esc(cliente.direccion) : ''}</div>
    ${notas.length ? `<div><b>${orden.obs && cambios.length ? 'Notas y cambios' : orden.obs ? 'Notas' : 'Cambios'}</b>${notas.join('<br>')}</div>` : '<div></div>'}</div>
  <div class="od-pie od-bloque">${pieEmpresa(E)}<br>Documento interno de pedido. No es comprobante tributario.</div>
</div>`;
}
const CSS = `.od{width:720px;padding:44px 52px 36px;background:#fff;color:#171c22;font-family:Manrope,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums;box-sizing:border-box}
.od *{box-sizing:border-box}.od-cab{display:flex;align-items:center;gap:18px}.od-logo{width:76px;height:auto;flex:none}
.od-t1{font-size:22px;font-weight:800;line-height:1.15}.od-t2{font-size:14px;color:#4f5965;margin-top:4px}
.od-banda{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-top:26px;padding:18px 22px;border-radius:12px;background:#f1f4f8}
.od-banda-et{font-size:12px;font-weight:600;color:#4f5965}.od-banda-v{font-size:36px;font-weight:800;color:#0b3a75;line-height:1.1;margin-top:2px;white-space:nowrap}
.od-banda-d{text-align:right;font-size:13px;line-height:1.7;color:#4f5965}
.od-caja{margin-top:22px;border:1px solid #d5dbe3;border-radius:12px;padding:4px 20px 2px}.od-caja+.od-caja{margin-top:16px}
.od-caja-cab{display:flex;justify-content:space-between;gap:16px;padding:12px 0 8px;border-bottom:1px solid #d5dbe3;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#4f5965}
.od-fila{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid #e4e8ee}.od-fila:last-child{border-bottom:0}
.od-fila-n{font-size:16px;font-weight:600}.od-fila-s{font-size:13px;color:#4f5965;margin-top:2px;line-height:1.5}.od-fila-v{font-size:16px;font-weight:600;white-space:nowrap}
.od-cambio{color:#8a4b00;font-weight:600}.od-quitado .od-fila-n{color:#8b939e;text-decoration:line-through}
.od-grupo{padding:10px 0;border-bottom:1px solid #e4e8ee}.od-grupo:last-child{border-bottom:0}
.od-grupo-cab{display:flex;justify-content:space-between;gap:16px;font-size:15px;font-weight:700}.od-grupo-l{display:flex;justify-content:space-between;gap:16px;font-size:13px;color:#4f5965;margin-top:3px}
.od-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px;margin-top:26px;font-size:13px;line-height:1.6;color:#4f5965}.od-info b{display:block;font-weight:700;color:#171c22}
.od-linea{margin-top:22px;font-size:13px;line-height:1.6;color:#4f5965}.od-linea b{font-weight:700;color:#171c22}
.od-pie{font-size:11px;line-height:1.6;color:#4f5965;border-top:1px solid #e4e8ee;padding-top:12px;margin-top:32px}
.od-anulada{position:relative;overflow:hidden}.od-sello{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%) rotate(-30deg);font-size:150px;font-weight:900;letter-spacing:12px;color:rgba(180,35,24,.2);border:12px solid rgba(180,35,24,.2);padding:0 30px;border-radius:24px;white-space:nowrap;pointer-events:none;z-index:2}
.od-franja{background:#b42318;color:#fff;font-size:13px;font-weight:700;letter-spacing:.5px;text-align:center;padding:9px 12px;border-radius:8px;margin-bottom:18px}`;
// La letra del PDF (Manrope, de Google Fonts) se carga una vez; si no hay internet, queda una parecida del equipo
let letraLista = null;
function cargarLetra() {
  if (!letraLista) letraLista = new Promise(ok => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap';
    const listo = () => Promise.all(['400', '600', '700', '800'].map(w => document.fonts.load(`${w} 16px Manrope`).catch(() => null))).then(ok, ok);
    l.onload = listo; l.onerror = () => ok(); setTimeout(ok, 4000);
    document.head.appendChild(l);
  });
  return letraLista;
}

// Arma el PDF (tamaño carta) y lo descarga. Si el contenido es más alto que una hoja, sigue en la siguiente.
// abrir: true → se muestra en otra pestaña (para revisar) en vez de descargarse
// comoArchivo: true → no descarga; devuelve { blob, nombre } (para compartir por WhatsApp)
export async function descargar(orden, cliente, originales, ediciones, abrir, comoArchivo) {
  const ventana = abrir ? window.open('', '_blank') : null;
  if (ventana) ventana.document.write('<p style="font-family:sans-serif;padding:24px">Generando el PDF…</p>');
  await Promise.all([script(CDN.h2c), script(CDN.jspdf), cargarLetra()]);
  const caja = document.createElement('div');
  caja.style.cssText = 'position:absolute;top:0;left:-99999px;width:720px;z-index:-1';
  caja.innerHTML = `<style>${CSS}</style>` + html(orden, cliente, originales || {}, ediciones || []);
  document.body.appendChild(caja);
  try {
    const img = caja.querySelector('.od-logo');
    if (img && !img.complete) await new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 4000); });
    const canvas = await window.html2canvas(caja.querySelector('.od'), { scale: 2, backgroundColor: '#ffffff', width: 720, windowWidth: 720 });
    const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
    const margen = 36, anchoUtil = 612 - margen * 2, altoUtil = 792 - margen * 2;
    let escala = anchoUtil / canvas.width;
    // Si se pasa por poco de una hoja, se achica un poco para que quepa en una (sin hoja en blanco)
    if (canvas.height * escala > altoUtil && canvas.height * escala <= altoUtil * 1.3) escala = altoUtil / canvas.height;
    const altoFranja = Math.max(50, Math.floor(altoUtil / escala));
    for (let y = 0, pag = 0; y < canvas.height; y += altoFranja, pag++) {
      const alto = Math.min(altoFranja, canvas.height - y);
      if (pag && alto < 40) break;   // un resto mínimo (solo margen) no hace otra hoja
      const c = document.createElement('canvas'); c.width = canvas.width; c.height = alto;
      c.getContext('2d').drawImage(canvas, 0, y, canvas.width, alto, 0, 0, canvas.width, alto);
      if (pag) pdf.addPage();
      pdf.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', margen + (anchoUtil - canvas.width * escala) / 2, margen, canvas.width * escala, alto * escala);
    }
    const nombre = (orden.estado === 'anulada' ? 'ANULADA_' : '') + 'Orden_' + String(orden.n).padStart(4, '0') + '_' + String(cliente.nombre || orden.cliente || 'cliente').replace(/[^a-zA-Z0-9]+/g, '_') + '.pdf';
    if (comoArchivo) return { blob: pdf.output('blob'), nombre };
    if (ventana) { ventana.location.href = pdf.output('bloburl'); return nombre; }
    pdf.save(nombre);
    return nombre;
  } catch (e) { if (ventana) ventana.close(); throw e; }
  finally { caja.remove(); }
}
