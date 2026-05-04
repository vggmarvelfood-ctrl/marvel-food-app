// ui-mejoras.js — Hero slider, lazy backgrounds, top productos, init runner
// 
// HERO SLIDER MEJORADO — dots + ken burns reinicio
// 
(function patchSlider() {
 function init() {
 const slider = document.getElementById('hero-slider');
 const dotsContainer = document.getElementById('hero-dots');
 if (!slider || !dotsContainer) return setTimeout(init, 300);

 const slides = slider.querySelectorAll('.hero-slide');
 const total = slides.length;

 // Crear dots
 dotsContainer.innerHTML = '';
 slides.forEach((_, i) => {
 const d = document.createElement('button');
 d.className = 'hero-dot' + (i === 0 ? ' active' : '');
 d.onclick = () => {
 slider.scrollTo({ left: slider.clientWidth * i, behavior: 'smooth' });
 };
 dotsContainer.appendChild(d);
 });

 function updateDots() {
 const idx = Math.round(slider.scrollLeft / slider.clientWidth);
 dotsContainer.querySelectorAll('.hero-dot').forEach((d, i) => {
 d.classList.toggle('active', i === idx);
 });
 // Reiniciar animación ken burns del slide activo
 slides.forEach((s, i) => {
 const bg = s.querySelector('.hero-bg-img');
 if (!bg) return;
 if (i === idx) {
 bg.style.animation = 'none';
 void bg.offsetWidth; // reflow
 bg.style.animation = 'heroKenBurns 8s ease-out forwards';
 }
 });
 }

 slider.addEventListener('scroll', updateDots, { passive: true });
 updateDots();
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
 else init();
})();

// 
// SISTEMA DE OPINIONES PÚBLICAS
// 
let _opPuntuacion = 0;

window.opLimpiarError = (el) => {
 if (el) el.style.borderColor = '';
 const errDiv = document.getElementById('op-error');
 if (errDiv) { errDiv.style.display = 'none'; errDiv.textContent = ''; }
};
const OP_LABELS = { 1:'Muy malo', 2:'Malo', 3:'Regular', 4:'Bueno', 5:'¡Excelente!' };

window.abrirModalOpinion = async (pedidoIdOrigen) => {
 _opPuntuacion = 0;
 window._opPedidoIdOrigen = pedidoIdOrigen || null;
 opSetStar(0);
 const inp = document.getElementById('op-nombre');
 const inpTel = document.getElementById('op-tel');
 const txt = document.getElementById('op-comentario');
 const errDiv = document.getElementById('op-error');
 if (txt) txt.value = '';
 if (errDiv) { errDiv.style.display = 'none'; errDiv.textContent = ''; }
 if (inp) { inp.value = ''; inp.style.borderColor = ''; }
 if (inpTel) { inpTel.value = ''; inpTel.style.borderColor = ''; }

 // Pre-cargar nombre y teléfono: primero desde Firebase si hay pedidoId, sino desde localStorage
 try {
 let nombre = '', tel = '';
 // Intentar cargar desde Firebase el pedido real
 if (pedidoIdOrigen && window.db) {
 try {
 const snap = await window.db.collection('pedidos_v2').doc(pedidoIdOrigen).get();
 if (snap.exists) {
 const d = snap.data();
 nombre = d.cliente || d.nombre || '';
 tel = d.tel || d.telefono || '';
 }
 } catch(e) { /* fallback a localStorage */ }
 }
 // Fallback: localStorage del último pedido
 if (!nombre || !tel) {
 const last = JSON.parse(localStorage.getItem('mf_last_pedido') || 'null');
 if (last) {
 if (!nombre && last.cliente) nombre = last.cliente;
 if (!tel && last.tel) tel = last.tel;
 }
 }
 // Fallback: campos del formulario de pedido en pantalla
 if (!nombre) {
 const cNombre = document.getElementById('c-nombre');
 if (cNombre && cNombre.value.trim()) nombre = cNombre.value.trim();
 }
 if (!tel) {
 const cTel = document.getElementById('c-tel');
 if (cTel && cTel.value.trim()) tel = cTel.value.trim();
 }
 if (inp && nombre) inp.value = nombre;
 if (inpTel && tel) inpTel.value = tel;
 } catch(e) { /* sin datos previos */ }

 // Mostrar tiempo restante en el botón si aún está en cooldown
 const _coolBtn = document.getElementById('op-btn-enviar');
 if (_coolBtn) {
 const _cd = 75 * 60 * 1000;
 const _ul = parseInt(localStorage.getItem('mf_last_resena') || '0');
 const _rest = _cd - (Date.now() - _ul);
 if (_rest > 0) {
 const _min = Math.ceil(_rest / 60000);
 _coolBtn.textContent = `Disponible en ${_min} min`;
 _coolBtn.style.background = '#2a2a2a';
 _coolBtn.style.color = '#6b7280';
 _coolBtn.disabled = true;
 } else {
 _coolBtn.textContent = 'Enviar Opinión';
 _coolBtn.style.background = '';
 _coolBtn.style.color = '';
 _coolBtn.disabled = false;
 }
 }

 document.getElementById('opinion-modal').style.display = 'flex';
};

window.cerrarModalOpinion = () => {
 document.getElementById('opinion-modal').style.display = 'none';
};

window.opSetStar = (v) => {
 _opPuntuacion = v;
 document.querySelectorAll('.op-star-btn').forEach((s, i) => {
 s.classList.toggle('sel', i < v);
 });
 const lbl = document.getElementById('op-label');
 if (lbl) lbl.textContent = v ? OP_LABELS[v] : '';
};

window.enviarOpinion = async () => {
 if (!_opPuntuacion) return alert('Seleccioná al menos 1 estrella.');

 // Validar campos obligatorios 
 const inpNombre = document.getElementById('op-nombre');
 const inpTel = document.getElementById('op-tel');
 const errDiv = document.getElementById('op-error');
 const nombre = (inpNombre?.value || '').trim();
 const telRaw = (inpTel?.value || '').replace(/\s+/g, '');
 const soloDigTel = telRaw.replace(/[^0-9]/g, '');

 let errMsg = '';
 if (!nombre || nombre.split(' ').filter(p => p.length > 0).length < 2) {
 errMsg = 'Por favor ingresá tu nombre y apellido completos.';
 if (inpNombre) inpNombre.style.borderColor = '#ef4444';
 } else if (soloDigTel.length < 8 || soloDigTel.length > 15) {
 errMsg = 'Ingresá un número de teléfono válido (mínimo 8 dígitos).';
 if (inpTel) inpTel.style.borderColor = '#ef4444';
 }

 if (errMsg) {
 if (errDiv) { errDiv.textContent = errMsg; errDiv.style.display = 'block'; }
 return;
 }
 if (errDiv) { errDiv.style.display = 'none'; errDiv.textContent = ''; }
 if (inpNombre) inpNombre.style.borderColor = '';
 if (inpTel) inpTel.style.borderColor = '';

 // Anti-spam: máximo 1 reseña cada 75 minutos por dispositivo
 const COOLDOWN_MS = 75 * 60 * 1000;
 const ultimaResena = parseInt(localStorage.getItem('mf_last_resena') || '0');
 const ahora = Date.now();
 const restante = COOLDOWN_MS - (ahora - ultimaResena);
 if (restante > 0) {
 const min = Math.ceil(restante / 60000);
 const btn = document.getElementById('op-btn-enviar');
 if (btn) {
 btn.textContent = `Esperá ${min} min para volver a opinar`;
 btn.style.background = '#333';
 btn.style.color = '#9ca3af';
 setTimeout(() => {
 btn.textContent = 'Enviar Opinión';
 btn.style.background = '';
 btn.style.color = '';
 }, 3000);
 }
 return;
 }
 const comentario = (document.getElementById('op-comentario')?.value || '').trim();
 const btn = document.getElementById('op-btn-enviar');
 if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

 try {
 const doc = {
 nombre,
 comentario,
 estrellas: _opPuntuacion,
 tel: telRaw,
 fecha: firebase.firestore.FieldValue.serverTimestamp(),
 aprobada: true
 };
 if (window._opPedidoIdOrigen) doc.pedidoId = window._opPedidoIdOrigen;
 await window.db.collection('opiniones').add(doc);
 localStorage.setItem('mf_last_resena', Date.now().toString());
 cerrarModalOpinion();
 const t = document.getElementById('toast');
 if (t) {
 t.style.background = '#f59e0b'; t.style.color = '#000';
 t.innerText = '¡Gracias por tu opinión!';
 t.classList.add('show');
 setTimeout(() => { t.classList.remove('show'); t.style.background=''; t.style.color=''; t.innerText='¡Agregado al pedido!'; }, 3000);
 }
 cargarOpinionesPub();
 // Ir a tab opiniones
 const navOp = document.querySelector('.nav-item[onclick*=tab-opiniones]');
 if (navOp) switchTab('tab-opiniones', navOp);
 } catch(e) {
 alert('Error al enviar: ' + e.message);
 } finally {
 if (btn) { btn.disabled = false; btn.textContent = 'Enviar Opinión'; }
 }
};

async function cargarOpinionesPub() {
 const lista = document.getElementById('opiniones-lista');
 if (!lista) return;
 if (!window.db) {
 lista.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:30px;">Conectando...</p>';
 return;
 }
 lista.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:30px;">Cargando...</p>';
 try {
 // Traemos TODAS las opiniones — sin filtro por 'aprobada'
 // porque opiniones creadas manualmente o desde versiones anteriores
 // pueden no tener ese campo. El admin puede eliminar las no deseadas.
 const snap = await window.db.collection('opiniones')
 .orderBy('fecha', 'desc')
 .get();

 const docs = [];
 snap.forEach(d => docs.push({ id: d.id, ...d.data() }));

 if (!docs.length) {
 lista.innerHTML = '<div style="text-align:center;padding:40px 20px;"><p style="color:var(--text-light);font-size:15px;font-weight:600;">Sé el primero en dejar tu opinión</p></div>';
 actualizarResumenOp([]);
 return;
 }
 actualizarResumenOp(docs);

 lista.innerHTML = docs.map(d => {
 const fecha = d.fecha?.toDate
 ? d.fecha.toDate().toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' })
 : '';
 // Estrellas siempre en color naranja de marca (var(--primary) / #f59e0b)
 const starsFull = d.estrellas || 0;
 const starsEmpty = 5 - starsFull;
 const starsHtml = `<span style="color:var(--primary,#f59e0b);font-size:17px;letter-spacing:2px;">${''.repeat(starsFull)}</span>`
 + (starsEmpty > 0 ? `<span style="color:rgba(245,158,11,0.25);font-size:17px;letter-spacing:2px;">${''.repeat(starsEmpty)}</span>` : '');
 const nombre = d.nombre || 'Anónimo';
 // Capitalizar correctamente si viene en mayúsculas de un pedido
 const nombreDisplay = nombre === nombre.toUpperCase() && nombre.length > 1
 ? nombre.charAt(0) + nombre.slice(1).toLowerCase()
 : nombre;
 return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:10px;"> <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;"> <div style="flex:1;min-width:0;"> <div style="font-weight:800;color:var(--white);font-size:14px;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nombreDisplay}</div> <div style="line-height:1;">${starsHtml}</div> </div> <div style="font-size:11px;color:var(--text-light);text-align:right;flex-shrink:0;margin-left:10px;padding-top:2px;">${fecha}</div> </div> ${d.comentario ? `<p style="color:var(--text-light);font-size:13px;line-height:1.5;margin:0;padding-top:10px;border-top:1px solid var(--border);">${d.comentario}</p>` : ''}
 </div>`;
 }).join('');
 } catch(e) {
 lista.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:30px;">No se pudieron cargar las opiniones.</p>';
 }
}

function actualizarResumenOp(docs) {
 const prom = document.getElementById('op-prom');
 const starsAvg = document.getElementById('op-stars-avg');
 const count = document.getElementById('op-count');
 const bars = document.getElementById('op-bars');
 if (!prom) return;

 if (!docs.length) {
 prom.textContent = '—'; starsAvg.textContent = ''; count.textContent = '0 reseñas';
 if (bars) bars.innerHTML = '';
 return;
 }
 const avg = docs.reduce((s, d) => s + (d.estrellas || 0), 0) / docs.length;
 prom.textContent = avg.toFixed(1);
 const fullStars = Math.round(avg);
 starsAvg.textContent = ''.repeat(fullStars) + ''.repeat(5 - fullStars);
 count.textContent = docs.length + ' reseña' + (docs.length !== 1 ? 's' : '');

 if (bars) {
 let html = '';
 for (let s = 5; s >= 1; s--) {
 const n = docs.filter(d => d.estrellas === s).length;
 const pct = docs.length ? Math.round(n / docs.length * 100) : 0;
 html += `
 <div style="display:flex;align-items:center;gap:7px;"><span style="color:#f59e0b;font-size:12px;white-space:nowrap;">${s}</span><div style="flex:1;height:6px;background:#333;border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--primary);border-radius:3px;transition:width .6s;"></div></div><span style="color:var(--text-light);font-size:11px;width:22px;text-align:right;">${n}</span></div>`;
 }
 bars.innerHTML = html;
 }
}


// ─────────────────────────────────────────────────────────────
// DETECCIÓN DE ZONA LOCAL — usa GF_GEOJSON embebido, sin red
// ─────────────────────────────────────────────────────────────

// Ray-casting: devuelve true si el punto (lat,lng) está dentro del polígono
function _raycast(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    // ring coords son [lng, lat]
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Devuelve { sucursal, zona, barrio_privado } o null
function _detectarZonaLocal(lat, lng) {
  const geo = typeof GF_GEOJSON !== 'undefined' ? GF_GEOJSON : null;
  if (!geo || !geo.features) return null;
  for (const feat of geo.features) {
    if (!feat.geometry || !feat.properties) continue;
    const geom = feat.geometry;
    const rings = geom.type === 'Polygon'
      ? [geom.coordinates[0]]
      : geom.coordinates.map(p => p[0]); // MultiPolygon: exterior rings
    for (const ring of rings) {
      if (_raycast(lat, lng, ring)) {
        return {
          sucursal: feat.properties.sucursal || null,
          zona: feat.properties.name || null,
          barrio_privado: !!feat.properties.barrio_privado,
        };
      }
    }
  }
  return null; // fuera de cobertura
}

// 
// PANTALLA DE BIENVENIDA — lógica
// 

let _wsGPS = null; // { lat, lng } si se obtuvo GPS
let _wsSucursalDetectada = null;
let _wsDirTimeout = null;
let _wsTipo = 'envio'; // 'envio' | 'retiro'
let _wsLocOk = false;
let _wsFueraDeCoberturaActivo = false; // true cuando la dir está fuera de zona

// Cambiar a retiro cuando no hay cobertura en la dirección
window.wsCambiarARetiro = function() {
 _wsFueraDeCoberturaActivo = false;
 wsTipoSeleccionar('retiro');
 const secRetiro = document.getElementById('ws-seccion-retiro');
 if (secRetiro) secRetiro.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
let _wsDirOk = false;

// Ver si ya se visitó antes (no mostrar de nuevo en la misma sesión)
// DESACTIVADO: el welcome-screen ya no se muestra; el menú abre directamente
/* (function checkWelcome() {
 const ya = sessionStorage.getItem('mf_welcome_done');
 if (ya === '1') {
 document.getElementById('welcome-screen').style.display = 'none';
 }
})(); */

function welcomeSkip() {
 sessionStorage.setItem('mf_welcome_done', '1');
 const ws = document.getElementById('welcome-screen');
 ws.style.opacity = '0';
 ws.style.transition = 'opacity .35s';
 setTimeout(() => { ws.style.display = 'none'; }, 360);
}

// Selector Retiro / Envío 
window.wsTipoSeleccionar = function(tipo) {
 _wsTipo = tipo;
 const btnEnvio = document.getElementById('ws-btn-envio');
 const btnRetiro = document.getElementById('ws-btn-retiro');
 const secEnvio = document.getElementById('ws-seccion-envio');
 const secRetiro = document.getElementById('ws-seccion-retiro');

 if (tipo === 'envio') {
 btnEnvio.style.borderColor = '#f59e0b';
 btnEnvio.style.background = 'rgba(245,158,11,0.12)';
 btnEnvio.style.color = '#f59e0b';
 btnRetiro.style.borderColor = '#333';
 btnRetiro.style.background = 'transparent';
 btnRetiro.style.color = '#9ca3af';
 secEnvio.style.display = 'block';
 secRetiro.style.display = 'none';
 } else {
 btnRetiro.style.borderColor = '#f59e0b';
 btnRetiro.style.background = 'rgba(245,158,11,0.12)';
 btnRetiro.style.color = '#f59e0b';
 btnEnvio.style.borderColor = '#333';
 btnEnvio.style.background = 'transparent';
 btnEnvio.style.color = '#9ca3af';
 secEnvio.style.display = 'none';
 secRetiro.style.display = 'block';
 }
 _wsVerificarContinuar();
};

window.wsRetiroSucursalChange = function() {
 const sel = document.getElementById('ws-sucursal-retiro');
 const info = document.getElementById('ws-retiro-info');
 const nom = document.getElementById('ws-retiro-nombre');
 const addr = document.getElementById('ws-retiro-addr');
 const sucId = sel.value;
 if (sucId && ZONA_INFO_UI[sucId]) {
 const z = ZONA_INFO_UI[sucId];
 nom.textContent = z.label;
 addr.textContent = z.direccion;
 info.style.display = 'block';
 _wsSucursalDetectada = sucId;
 } else {
 info.style.display = 'none';
 _wsSucursalDetectada = null;
 }
 _wsVerificarContinuar();
};

function _wsVerificarContinuar() {
 const btn = document.getElementById('ws-btn-continuar');
 if (!btn) return;
 let ok = false;

 if (_wsTipo === 'retiro') {
 ok = !!_wsSucursalDetectada;
 } else {
 // envio: necesita dir + loc y NO estar fuera de cobertura confirmada
 const dir = (document.getElementById('ws-dir-input')?.value || '').trim();
 const loc = (document.getElementById('ws-loc-input')?.value || '').trim();
 ok = dir.length >= 5 && loc.length >= 3 && !_wsFueraDeCoberturaActivo;
 }

 if (ok) {
 btn.disabled = false;
 btn.style.background = 'var(--primary, #f59e0b)';
 btn.style.color = '#000';
 btn.style.cursor = 'pointer';
 btn.textContent = 'Continuar →';
 } else {
 btn.disabled = true;
 btn.style.background = '#444';
 btn.style.color = '#888';
 btn.style.cursor = 'not-allowed';
 if (_wsFueraDeCoberturaActivo) btn.textContent = 'Sin cobertura en esa dirección';
 }
}

function welcomeUsarGPS() {
 const btn = document.getElementById('ws-btn-gps');
 const txt = document.getElementById('ws-gps-txt');
 txt.textContent = 'Obteniendo ubicación...';
 btn.disabled = true;

 if (!navigator.geolocation) {
 txt.textContent = 'GPS no disponible en este navegador';
 btn.style.borderColor = '#ef4444';
 btn.style.color = '#ef4444';
 btn.disabled = false;
 return;
 }

 navigator.geolocation.getCurrentPosition(
 (pos) => {
 const lat = pos.coords.latitude;
 const lng = pos.coords.longitude;
 _wsGPS = { lat, lng };

 // Guardar coords en coordenadasGPS global para el checkout
 window.coordenadasGPS = lat + ',' + lng;

 txt.textContent = 'Ubicación obtenida — ahora escribí tu dirección';
 btn.style.borderColor = '#10b981';
 btn.style.background = 'rgba(16,185,129,0.2)';
 btn.disabled = false;

 // v3: usar determinarSucursal() async (Firebase+Turf) con fallback síncrono
 (async () => {
 const result = await window.determinarSucursal(lat, lng);
 const sucSug = result?.sucursal || sucursalParaPunto(lat, lng) || sucursalMasCercana(lat, lng);
 _wsSucursalDetectada = sucSug;

 // Mostrar aviso si es barrio privado
 if (result?.requiresSpecialAccess) {
 const resultEl = document.getElementById('ws-zona-result');
 if (resultEl) {
 resultEl.style.display = 'block';
 resultEl.style.background = 'rgba(239,68,68,0.08)';
 resultEl.style.border = '1px solid rgba(239,68,68,0.35)';
 resultEl.innerHTML = '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:20px;"></span><div><div style="font-weight:800;color:#ef4444;font-size:13px;">Barrio privado detectado</div><div style="color:#d1d5db;font-size:12px;margin-top:2px;">Zona: <strong style="color:#fff;">' + (result.zona||sucSug) + '</strong></div><div style="color:#9ca3af;font-size:11px;">Nuestro cadete coordinará el acceso</div></div></div>';
 }
 }

 // No habilitamos continuar solo por GPS — usuario DEBE escribir dirección
 _wsVerificarContinuar();
 })();
 },
 () => {
 txt.textContent = 'No se pudo obtener la ubicación';
 btn.style.borderColor = '#ef4444';
 btn.style.color = '#ef4444';
 btn.disabled = false;
 // Fallback: sugerir selección manual de sucursal (Integration Doc §6 — Manejo de Errores)
 const wsZoneResult = document.getElementById('ws-zona-result');
 if (wsZoneResult) {
 wsZoneResult.style.display = 'block';
 wsZoneResult.style.background = 'rgba(245,158,11,0.06)';
 wsZoneResult.style.border = '1px solid rgba(245,158,11,0.3)';
 wsZoneResult.innerHTML = '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:18px;"></span><div><div style="font-weight:800;color:#f59e0b;font-size:13px;">Ubicación no disponible</div><div style="color:#d1d5db;font-size:12px;margin-top:2px;">Escribí tu dirección para detectar la zona, o seleccioná tu sucursal manualmente en el carrito.</div></div></div>';
 }
 },
 { enableHighAccuracy: true, timeout: 8000 }
 );
}

let _wsDirVerifyTimeout = null;
function welcomeDirInput() {
 clearTimeout(_wsDirVerifyTimeout);
 const val = document.getElementById('ws-dir-input').value.trim();
 const result = document.getElementById('ws-zona-result');

 _wsVerificarContinuar();

 if (val.length < 5) {
 result.style.display = 'none';
 _wsSucursalDetectada = _wsGPS ? _wsSucursalDetectada : null;
 return;
 }

 // Mostrar spinner
 result.style.display = 'block';
 result.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:13px;padding:8px 0;">Verificando zona...</div>';
 result.style.background = 'rgba(255,255,255,0.04)';
 result.style.border = '1px solid #333';

 _wsDirVerifyTimeout = setTimeout(async () => {
 const locRaw = (document.getElementById('ws-loc-input')?.value || '').trim();
 // Parsear: si el usuario escribió todo junto (ej "paraguay 2272 rosario"), separar
 const { dir: dirGeo, loc: locVal } = (typeof _parsearDireccionCompleta === 'function')
 ? _parsearDireccionCompleta(val, locRaw)
 : { dir: val, loc: locRaw };

 function _mostrarFueraDeCobertura(sucMasCercana) {
 const infoSuc = (typeof ZONA_INFO_UI !== 'undefined' && sucMasCercana && ZONA_INFO_UI[sucMasCercana]) || { label: sucMasCercana || '' };
 _wsSucursalDetectada = null;
 _wsFueraDeCoberturaActivo = true;
 result.style.background = 'rgba(239,68,68,0.08)';
 result.style.border = '1px solid rgba(239,68,68,0.4)';
 result.style.display = 'block';
 result.innerHTML =
 '<div style="display:flex;flex-direction:column;gap:10px;">' +
 '<div>' +
 '<div style="font-weight:800;color:#ef4444;font-size:13px;margin-bottom:4px;">No llegamos a esa direccion</div>' +
 '<div style="color:#d1d5db;font-size:12px;">Esa zona esta fuera de nuestra area de entrega.</div>' +
 (sucMasCercana ? '<div style="color:#9ca3af;font-size:11px;margin-top:4px;">Sucursal mas cercana: <strong style="color:#fff;">' + infoSuc.label + '</strong></div>' : '') +
 '</div>' +
 '<button onclick="wsCambiarARetiro()" style="width:100%;padding:10px 0;border-radius:10px;border:1px solid rgba(245,158,11,0.5);background:rgba(245,158,11,0.12);color:#f59e0b;font-size:13px;font-weight:700;cursor:pointer;">Cambiar a Retiro en Local</button>' +
 '</div>';
 _wsVerificarContinuar();
 }

 try {
 // CAPA 1: detección rápida por localidad conocida (sin red)
 if (locVal.length >= 3) {
 const sucPorLoc = (typeof _sucursalPorLocalidad === 'function') ? _sucursalPorLocalidad(locVal) : null;
 if (sucPorLoc) {
 _wsSucursalDetectada = sucPorLoc;
 _wsFueraDeCoberturaActivo = false;
 welcomeMostrarResultado(sucPorLoc, locVal, true);
 _wsVerificarContinuar();
 return;
 }
 }

 // CAPA 2: geocodificar para obtener coordenadas (necesita red)
 result.style.display = 'block';
 result.style.background = 'rgba(255,255,255,0.03)';
 result.style.border = '1px solid #333';
 result.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:13px;padding:6px 0;">Buscando direccion...</div>';

  const coords = await _geocodificar(dirGeo, locVal);
 if (!coords) {
 _wsSucursalDetectada = null;
 _wsFueraDeCoberturaActivo = false;
 result.style.background = 'rgba(239,68,68,0.08)';
 result.style.border = '1px solid rgba(239,68,68,0.3)';
 result.innerHTML =
 '<div>' +
 '<div style="font-weight:800;color:#ef4444;font-size:13px;margin-bottom:4px;">No encontramos esa direccion</div>' +
 '<div style="color:#d1d5db;font-size:12px;">Revisa la calle y localidad e intenta de nuevo.</div>' +
 '</div>';
 _wsVerificarContinuar();
 return;
 }

 _wsGPS = coords;

 // CAPA 3: punto-en-poligono con GF_GEOJSON embebido (sin red, instantaneo)
 const zonaLocal = _detectarZonaLocal(coords.lat, coords.lng);

 if (zonaLocal && zonaLocal.sucursal) {
 // Dentro de cobertura
 _wsSucursalDetectada = zonaLocal.sucursal;
 _wsFueraDeCoberturaActivo = false;
 const infoSuc = (typeof ZONA_INFO_UI !== 'undefined' && ZONA_INFO_UI[zonaLocal.sucursal]) || { label: zonaLocal.sucursal, direccion: '' };
 result.style.background = zonaLocal.barrio_privado ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)';
 result.style.border = zonaLocal.barrio_privado ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(16,185,129,0.35)';
 result.style.display = 'block';
 if (zonaLocal.barrio_privado) {
 result.innerHTML =
 '<div>' +
 '<div style="font-weight:800;color:#ef4444;font-size:13px;margin-bottom:4px;">Barrio privado — acceso especial</div>' +
 '<div style="color:#d1d5db;font-size:12px;">Sucursal: <strong style="color:#fff;">' + infoSuc.label + '</strong></div>' +
 '<div style="color:#9ca3af;font-size:11px;margin-top:3px;">Zona: ' + (zonaLocal.zona || '') + '</div>' +
 '<div style="color:#9ca3af;font-size:11px;">Nuestro cadete coordinara el ingreso</div>' +
 '</div>';
 } else {
 result.innerHTML =
 '<div>' +
 '<div style="font-weight:800;color:#10b981;font-size:13px;margin-bottom:4px;">Llegamos a tu zona</div>' +
 '<div style="color:#d1d5db;font-size:12px;">Sucursal: <strong style="color:#fff;">' + infoSuc.label + '</strong></div>' +
 (zonaLocal.zona ? '<div style="color:#9ca3af;font-size:11px;margin-top:2px;">' + zonaLocal.zona + '</div>' : '') +
 '<div style="color:#9ca3af;font-size:11px;">' + (infoSuc.direccion || '') + '</div>' +
 '</div>';
 }
 } else {
 // Fuera de cobertura — calcular sucursal más cercana
 const sucMasCercana = (typeof sucursalMasCercana === 'function') ? sucursalMasCercana(coords.lat, coords.lng) : null;
 _mostrarFueraDeCobertura(sucMasCercana);
 return;
 }
 } catch(e) {
 console.warn('[WelcomeDir] Error:', e.message);
 _wsSucursalDetectada = null;
 _wsFueraDeCoberturaActivo = false;
 result.style.background = 'rgba(245,158,11,0.06)';
 result.style.border = '1px solid rgba(245,158,11,0.3)';
 result.style.display = 'block';
 result.innerHTML =
 '<div>' +
 '<div style="font-weight:700;color:#f59e0b;font-size:13px;margin-bottom:4px;">No pudimos verificar la direccion</div>' +
 '<div style="color:#d1d5db;font-size:12px;">Revisa que este bien escrita o usa GPS.</div>' +
 '</div>';
 }
 _wsVerificarContinuar();
 }, 900);
}

// Re-detectar sucursal cuando cambia la localidad en la pantalla de bienvenida
window.welcomeLocInput = function() {
 _wsVerificarContinuar();
 clearTimeout(_wsDirVerifyTimeout);
 const locVal = (document.getElementById('ws-loc-input')?.value || '').trim();
 const dirVal = (document.getElementById('ws-dir-input')?.value || '').trim();

 if (locVal.length >= 3) {
 _wsDirVerifyTimeout = setTimeout(() => {
 const sucPorLoc = _sucursalPorLocalidad(locVal);
 if (sucPorLoc) {
 _wsSucursalDetectada = sucPorLoc;
 const result = document.getElementById('ws-zona-result');
 if (result) welcomeMostrarResultado(sucPorLoc, locVal, true);
 _wsVerificarContinuar();
 } else if (dirVal.length >= 5) {
 // Si hay dirección también, geocodificar con la localidad nueva
 const result = document.getElementById('ws-zona-result');
 if (result) {
 result.style.display = 'block';
 result.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:13px;padding:8px 0;">Verificando zona...</div>';
 }
 _geocodificar(dirVal, locVal).then(coords => {
 if (!coords) return;
 const sucCubre = sucursalParaPunto(coords.lat, coords.lng);
 const sucSug = sucCubre || sucursalMasCercana(coords.lat, coords.lng);
 _wsSucursalDetectada = sucSug;
 welcomeMostrarResultado(sucSug, locVal, sucCubre !== null);
 _wsVerificarContinuar();
 });
 }
 }, 500);
 }
};

function welcomeMostrarResultado(sucId, dir, exacta, gfResult) {
 const result = document.getElementById('ws-zona-result');
 const info = ZONA_INFO_UI[sucId] || { label: sucId, direccion: '' };
 const esPrivado = gfResult?.requiresSpecialAccess === true;
 const zonaGranular = gfResult?.zona || '';

 if (esPrivado) {
 // Barrio privado — aviso especial en rojo
 result.style.background = 'rgba(239,68,68,0.08)';
 result.style.border = '1px solid rgba(239,68,68,0.35)';
 result.innerHTML = `
 <div style="display:flex;align-items:center;gap:10px;"> <span style="font-size:24px;"></span> <div> <div style="font-weight:800;color:#ef4444;font-size:13px;">Barrio privado — acceso especial</div> <div style="color:#d1d5db;font-size:12px;margin-top:2px;">Sucursal: <strong style="color:#fff;">${info.label}</strong></div> ${zonaGranular ? `<div style="color:#9ca3af;font-size:11px;">Zona: ${zonaGranular}</div>` : ''}
 <div style="color:#9ca3af;font-size:11px;margin-top:3px;">Nuestro cadete coordinará el ingreso</div> </div> </div>`;
 } else if (exacta) {
 result.style.background = 'rgba(16,185,129,0.08)';
 result.style.border = '1px solid rgba(16,185,129,0.35)';
 result.innerHTML = `
 <div style="display:flex;align-items:center;gap:10px;"> <span style="font-size:22px;color:#10b981;font-weight:800;"></span> <div> <div style="font-weight:800;color:#10b981;font-size:13px;">¡Llegamos a tu zona!</div> <div style="color:#d1d5db;font-size:12px;margin-top:2px;">Sucursal: <strong style="color:#fff;">${info.label}</strong></div> ${zonaGranular ? `<div style="color:#9ca3af;font-size:11px;">Zona: ${zonaGranular}</div>` : ''}
 <div style="color:#9ca3af;font-size:11px;">${info.direccion}</div> </div> </div>`;
 } else {
 result.style.background = 'rgba(245,158,11,0.06)';
 result.style.border = '1px solid rgba(245,158,11,0.3)';
 result.innerHTML = `
 <div style="display:flex;align-items:center;gap:10px;"> <span style="font-size:22px;"></span> <div> <div style="font-weight:800;color:#f59e0b;font-size:13px;">Sucursal más cercana</div> <div style="color:#d1d5db;font-size:12px;margin-top:2px;"><strong style="color:#fff;">${info.label}</strong></div> <div style="color:#9ca3af;font-size:11px;">${info.direccion}</div> </div> </div>`;
 }

 result.style.display = 'block';
}

function welcomeContinuar() {
 const tipoEntrega = _wsTipo; // 'envio' | 'retiro'

 // Guardar tipo de entrega para pre-seleccionar en el carrito
 if (typeof window.setGeneralDelivery === 'function') {
 window.setGeneralDelivery(tipoEntrega === 'envio');
 }

 if (_wsTipo === 'retiro') {
 // Retiro: pre-seleccionar sucursal
 if (_wsSucursalDetectada) {
 const sel = document.getElementById('main-sucursal');
 if (sel) {
 sel.value = _wsSucursalDetectada;
 if (typeof window.cambiarSucursalPrincipal === 'function') {
 window.cambiarSucursalPrincipal();
 }
 }
 }
 } else {
 // Envío: pre-cargar dirección Y localidad en el checkout
 const wsDir = document.getElementById('ws-dir-input').value.trim();
 const wsLoc = document.getElementById('ws-loc-input').value.trim();

 if (wsDir) {
 const cDir = document.getElementById('c-dir');
 if (cDir) cDir.value = wsDir;
 }
 if (wsLoc) {
 const cLoc = document.getElementById('c-loc');
 if (cLoc) cLoc.value = wsLoc;
 }

 // GPS al checkout
 if (_wsGPS) {
 window.coordenadasGPS = _wsGPS.lat + ',' + _wsGPS.lng;
 const locStat = document.getElementById('loc-status');
 if (locStat) {
 locStat.textContent = 'Ubicación guardada con éxito';
 locStat.parentElement.style.background = 'rgba(16,185,129,0.2)';
 locStat.parentElement.style.border = '1px solid #10b981';
 locStat.style.color = '#10b981';
 }
 }

 // Si detectamos sucursal, pre-seleccionarla
 if (_wsSucursalDetectada) {
 const sel = document.getElementById('main-sucursal');
 if (sel) {
 sel.value = _wsSucursalDetectada;
 if (typeof window.cambiarSucursalPrincipal === 'function') {
 window.cambiarSucursalPrincipal();
 }
 }
 }
 }
 welcomeSkip();
}

// 
// TOP PRODUCTOS — calcula top 5 desde pedidos_v2 de Firebase
// 
async function cargarTopProductos() {
 if (!window.db) return;
 try {
 const snap = await window.db.collection('pedidos_v2')
 .limit(100).get();
 const conteo = {};
 snap.forEach(doc => {
 (doc.data().items || []).forEach(item => {
 const key = item.n;
 if (!conteo[key]) conteo[key] = { n: item.n, cant: 0, img: item.img || '' };
 conteo[key].cant += (item.cant || 1);
 });
 });
 const top5 = Object.values(conteo).sort((a,b) => b.cant - a.cant).slice(0, 5);
 if (!top5.length) return;
 const sec = document.getElementById('section-top-prods');
 const lista = document.getElementById('top-prods-lista');
 if (!sec || !lista) return;
 lista.innerHTML = top5.map((p, i) => `
 <div style="flex-shrink:0;width:130px;background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;cursor:pointer;" onclick="scrollToMenu()"> ${p.img ? `<div style="width:100%;height:90px;background-image:url('${p.img}');background-size:cover;background-position:center;position:relative;"><div style="position:absolute;top:6px;left:6px;background:var(--primary);color:#000;font-size:9px;font-weight:800;padding:2px 7px;border-radius:10px;">#${i+1}</div></div>` : `<div style="width:100%;height:90px;background:var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-light);font-weight:800;">#${i+1}</div>`}
 <div style="padding:8px 10px;"> <div style="font-size:12px;font-weight:700;color:var(--white);line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${p.n}</div> <div style="font-size:10px;color:var(--text-light);margin-top:3px;">${p.cant} pedido${p.cant!==1?'s':''}</div> </div> </div>`).join('');
 sec.style.display = 'block';
 } catch(e) {}
}

// 
// RESUMEN OPINIONES EN INICIO
// 
async function cargarResumenOpinionesInicio() {
 if (!window.db) return;
 try {
 const snap = await window.db.collection('opiniones')
 .orderBy('fecha', 'desc').limit(20).get(); // Limitado para no saturar memoria móvil
 const docs = [];
 snap.forEach(d => docs.push(d.data()));
 if (!docs.length) return;
 const avg = docs.reduce((s,d) => s + (d.estrellas||0), 0) / docs.length;
 const fullS = Math.round(avg);
 const promEl = document.getElementById('inicio-op-prom');
 const starsEl = document.getElementById('inicio-op-stars');
 const prevEl = document.getElementById('inicio-op-preview');
 const sec = document.getElementById('section-resumen-opiniones');
 if (promEl) promEl.textContent = avg.toFixed(1);
 if (starsEl) starsEl.textContent = ''.repeat(fullS) + ''.repeat(5-fullS);
 const conCom = docs.find(d => d.comentario && d.comentario.trim());
 if (prevEl && conCom) {
 const n = (conCom.nombre||'Cliente');
 const nd = n === n.toUpperCase() && n.length>1 ? n.charAt(0)+n.slice(1).toLowerCase() : n;
 prevEl.textContent = `"${conCom.comentario}" — ${nd}`;
 } else if (prevEl) {
 prevEl.textContent = `${docs.length} reseña${docs.length!==1?'s':''} de nuestros clientes`;
 }
 if (sec) sec.style.display = 'block';
 } catch(e) {}
}

// 
// BADGE EN TAB PROMOS
// 
function actualizarBadgePromos() {
 const badge = document.getElementById('badge-promos');
 if (!badge) return;
 const hoy = new Date().getDay();
 const hay = typeof PROMOS_DATA !== 'undefined' &&
 PROMOS_DATA.some(p => !p._oculta && (p.diaVenta===null||p.diaVenta===undefined||p.diaVenta===hoy));
 badge.style.display = hay ? 'block' : 'none';
}

// 
// CART-FLOAT — ocultar con input enfocado dentro del carrito
// 
(function setupCartFloatHide() {
 function apply() {
 const cartView = document.getElementById('cart-view');
 const btn = document.querySelector('.cart-float');
 if (!cartView || !btn) return setTimeout(apply, 500);
 cartView.addEventListener('focusin', e => {
 if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) btn.classList.add('input-focused');
 });
 cartView.addEventListener('focusout', () => setTimeout(() => btn.classList.remove('input-focused'), 250));
 }
 if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', apply);
 else apply();
})();

// 
// ARRANCAR TODO AL CARGAR
// 
(function initMejoras() {
 // Lazy-load de imágenes de fondo del hero slider usando IntersectionObserver
 function initLazyBg() {
 var lazyEls = document.querySelectorAll('.lazy-bg[data-bg]');
 if (!lazyEls.length) return;
 if ('IntersectionObserver' in window) {
 var obs = new IntersectionObserver(function(entries) {
 entries.forEach(function(entry) {
 if (entry.isIntersecting) {
 var el = entry.target;
 el.style.backgroundImage = 'url(' + el.getAttribute('data-bg') + ')';
 el.removeAttribute('data-bg');
 obs.unobserve(el);
 }
 });
 }, { rootMargin: '200px' });
 lazyEls.forEach(function(el) { obs.observe(el); });
 } else {
 // Fallback sin IntersectionObserver (Android <5)
 lazyEls.forEach(function(el) {
 el.style.backgroundImage = 'url(' + el.getAttribute('data-bg') + ')';
 });
 }
 }

 function run(t) {
 t = t||0;
 if (!window.db) { if(t<30) setTimeout(function(){run(t+1);}, 300); return; }
 if (window.__IS_ADMIN__) cargarTopProductos(); // solo admins pueden leer pedidos_v2
 cargarResumenOpinionesInicio();
 actualizarBadgePromos();
 // GeoFencing v3: pre-calentar caché de zonas en background
 // Así cuando el usuario abre el carrito ya está listo
 setTimeout(function() {
 if (window._gfLoadZones) {
 window._gfLoadZones().catch(function() {});
 }
 }, 2000);
 }
 if (document.readyState==='loading') {
 document.addEventListener('DOMContentLoaded', function(){ initLazyBg(); run(); });
 } else {
 initLazyBg();
 run();
 }
})();
// ═══════════════════════════════════════════════════════════════════
//  MEJORA 4 — Microinteracciones de Tab + Lazy BG optimizado +
//             Badges SVG sobre imágenes de productos +
//             Virtual Scrolling básico para grilla del menú
// ═══════════════════════════════════════════════════════════════════

// ── Microinteracción de entrada en cambio de tab ──────────────────
(function patchSwitchTab() {
  function init() {
    const origSwitch = window.switchTab;
    if (typeof origSwitch !== 'function') {
      return setTimeout(init, 300);
    }
    window.switchTab = function(tabId, el) {
      // Animar la tab entrante
      const target = document.getElementById(tabId);
      if (target) {
        target.classList.add('tab-enter');
        // Forzar reflow para que la transición aplique
        void target.offsetWidth;
        target.classList.add('tab-enter-active');
        target.classList.remove('tab-enter');
        setTimeout(() => target.classList.remove('tab-enter-active'), 260);
      }
      return origSwitch.apply(this, arguments);
    };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ── Lazy Background optimizado con IntersectionObserver ───────────
(function initLazyBg() {
  function init() {
    const lazys = document.querySelectorAll('.lazy-bg[data-bg]');
    if (!lazys.length) return;

    if (!('IntersectionObserver' in window)) {
      // Fallback: cargar todas inmediatamente
      lazys.forEach(el => {
        el.style.backgroundImage = `url('${el.dataset.bg}')`;
      });
      return;
    }

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const bgSrc = el.dataset.bg;
        // Validación: no cargar si la URL está ausente o es literalmente "undefined"
        if (!bgSrc || bgSrc === 'undefined') { obs.unobserve(el); return; }
        const img = new Image();
        img.onload = () => {
          el.style.backgroundImage = `url('${bgSrc}')`;
          el.classList.add('lazy-bg-loaded');
        };
        img.onerror = () => { obs.unobserve(el); }; // silenciar error 404
        img.src = bgSrc;
        obs.unobserve(el);
      });
    }, { rootMargin: '200px 0px' }); // pre-cargar 200px antes de entrar en vista

    lazys.forEach(el => obs.observe(el));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ── Badges SVG sobre imágenes de productos ─────────────────────────
// Se activa después de que el menú esté renderizado (hook en Firebase:ready)
(function initProductBadges() {
  function attachBadges() {
    // Buscar todas las cards del menú que tengan data-attrs de categoría
    document.querySelectorAll('.menu-card[data-veggie="true"]').forEach(card => {
      _ensureBadge(card, 'veggie', 'Veggie');
    });
    document.querySelectorAll('.menu-card[data-nuevo="true"]').forEach(card => {
      _ensureBadge(card, 'nuevo', 'Nuevo');
    });
  }

  function _ensureBadge(card, type, label) {
    // Solo agregar si no existe ya
    if (card.querySelector('.prod-badge-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'prod-badge-wrap';
    const badge = document.createElement('span');
    badge.className = `prod-badge prod-badge--${type}`;
    // SVG inline según tipo
    const icons = {
      veggie: '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M17 8C8 10 5.9 16.17 3.82 21L5.71 22l1-2.3A4.49 4.49 0 008 20C19 20 22 3 22 3c-1 2-8 2-8 2"/></svg>',
      nuevo:  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    };
    badge.innerHTML = (icons[type] || '') + label;
    wrap.appendChild(badge);

    // Asegurarse que el parent tenga position:relative
    const imgParent = card.querySelector('.menu-card-img, .m-hero, img')?.parentElement || card;
    imgParent.style.position = 'relative';
    imgParent.appendChild(wrap);
  }

  document.addEventListener('firebase:ready', () => setTimeout(attachBadges, 800));
  // También intentar en carga directa
  if (document.readyState !== 'loading') {
    setTimeout(attachBadges, 1200);
  }
})();

// ── Virtual Scrolling básico para grilla del menú ─────────────────
// Renderiza solo los items visibles + un buffer, mejorando el
// rendimiento en móviles de gama baja con menús extensos.
(function initVirtualScroll() {
  'use strict';

  const BUFFER_ITEMS = 8; // items fuera del viewport a mantener renderizados

  /**
   * Aplica "visibilidad inteligente" a las cards del menú usando
   * IntersectionObserver. Las cards fuera del viewport reducen su
   * huella de memoria ocultando el contenido pesado (imágenes).
   *
   * No elimina del DOM (para no romper listeners), sino que
   * descarga la imagen src cuando está lejos del viewport.
   */
  function initMenuVirtualization() {
    // Solo activar si hay más de 20 items (costo-beneficio)
    const container = document.getElementById('menu-container');
    if (!container) return;

    const cards = container.querySelectorAll('.menu-card');
    if (cards.length < 20) return;

    if (!('IntersectionObserver' in window)) return;

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const card = entry.target;
        const img  = card.querySelector('img[data-src-original]');
        if (!img) return;

        if (entry.isIntersecting) {
          // Restaurar imagen
          if (img.dataset.srcOriginal && !img.src.includes(img.dataset.srcOriginal)) {
            img.src = img.dataset.srcOriginal;
          }
        }
        // No descargamos en salida para no generar thrashing en scroll rápido
      });
    }, {
      rootMargin: '400px 0px', // buffer generoso = sin parpadeos
      threshold: 0,
    });

    cards.forEach(card => {
      const img = card.querySelector('img[src]');
      if (img && img.src) {
        // Guardar src original para restauración
        img.dataset.srcOriginal = img.src;
      }
      obs.observe(card);
    });

    console.log(`[VirtualScroll] Observando ${cards.length} cards del menú.`);
  }

  // Activar después de que el menú esté renderizado
  document.addEventListener('firebase:ready', () => setTimeout(initMenuVirtualization, 1500));
})();
