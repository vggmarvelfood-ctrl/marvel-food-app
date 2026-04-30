// sw-pwa.js — Registro del Service Worker y banner de instalación PWA
// 
// PWA INSTALL BANNER — Sistema completo
// 
let _pwaPrompt = null;

// Detectar plataforma
function _pwaEsIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

// Verificar si ya está corriendo como app instalada 
function _pwaEsInstalada() {
 return window.matchMedia('(display-mode: standalone)').matches
 || window.navigator.standalone === true
 || document.referrer.includes('android-app://');
}

// Mostrar / ocultar banner 
function _pwaBannerHeight() {
 const b = document.getElementById('pwa-install-banner');
 return (b && b.classList.contains('visible')) ? b.offsetHeight : 0;
}

function _pwaMostrarBanner() {
 if (_pwaEsInstalada()) return;
 const banner = document.getElementById('pwa-install-banner');
 if (!banner) return;

 // En iOS: cambiar texto del botón a instrucciones nativas
 if (_pwaEsIOS()) {
   const btnInstall = document.getElementById('pwa-btn-install');
   if (btnInstall) {
     btnInstall.innerHTML = 'Agregar<br>al inicio';
   }
 }
 banner.classList.add('visible');
}

function _pwaOcultarBanner() {
 const banner = document.getElementById('pwa-install-banner');
 if (!banner) return;
 banner.classList.remove('visible');
}

// Toast de progreso (descargando / completado) 
function _pwaToast(msg, tipo) {
 let el = document.getElementById('pwa-progress-toast');
 if (!el) {
 el = document.createElement('div');
 el.id = 'pwa-progress-toast';
 el.style.cssText = 'position:fixed;bottom:160px;left:50%;transform:translateX(-50%) translateY(20px);padding:13px 22px;border-radius:50px;font-weight:700;font-size:14px;z-index:9999;opacity:0;transition:all .35s cubic-bezier(.4,0,.2,1);pointer-events:none;white-space:nowrap;display:flex;align-items:center;gap:9px;box-shadow:0 8px 24px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);max-width:calc(100vw - 40px);text-align:center;';
 document.body.appendChild(el);
 }
 el.style.background = tipo === 'success' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#f59e0b,#d97706)';
 el.style.color = tipo === 'info' ? '#000' : '#fff';
 el.innerHTML = msg;
 requestAnimationFrame(() => {
 el.style.opacity = '1';
 el.style.transform = 'translateX(-50%) translateY(0)';
 });
 if (tipo === 'success') {
 setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(-50%) translateY(20px)'; }, 4500);
 }
}

function _pwaToastHide() {
 const el = document.getElementById('pwa-progress-toast');
 if (el) { el.style.opacity='0'; el.style.transform='translateX(-50%) translateY(20px)'; }
}

// Evento: el navegador dice que se puede instalar (Android/Chrome)
window.addEventListener('beforeinstallprompt', (e) => {
 e.preventDefault();
 _pwaPrompt = e;
 // Mostrar banner siempre (a los 2s de cargar la página)
 setTimeout(_pwaMostrarBanner, 2000);
});

// iOS: no hay beforeinstallprompt → mostrar banner con instrucciones nativas
// Solo si no está ya instalada y el usuario no lo descartó antes
(function _pwaIOSFallback() {
 if (_pwaEsInstalada()) return;
 if (!_pwaEsIOS()) return;
 // Mostrar a los 3 segundos en iOS
 setTimeout(function() {
   if (!_pwaEsInstalada()) _pwaMostrarBanner();
 }, 3000);
})();

// Evento: se abre el carrito → mostrar banner también 
// Parchamos toggleCart para mostrar el banner al abrir el carrito
(function() {
 function patchToggleCart() {
 const orig = window.toggleCart;
 if (typeof orig !== 'function') { setTimeout(patchToggleCart, 300); return; }
 window.toggleCart = function() {
 orig.apply(this, arguments);
 // Si el carrito se acaba de abrir, mostrar banner de instalación
 const cv = document.getElementById('cart-view');
 if (cv && cv.classList.contains('open') && !_pwaEsInstalada() && _pwaPrompt) {
 setTimeout(_pwaMostrarBanner, 800);
 }
 };
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patchToggleCart);
 else patchToggleCart();
})();

// Se completó la instalación 
window.addEventListener('appinstalled', () => {
 _pwaPrompt = null;
 _pwaOcultarBanner();
 _pwaToastHide();
 _pwaToast('¡App instalada! Ya podés usarla desde tu pantalla de inicio', 'success');
 localStorage.setItem('pwa_installed', '1');
});

// Botón "Instalar" del banner 
window.pwaTriggerInstall = async () => {
 // iOS: mostrar instrucciones nativas (no hay API de instalación)
 if (_pwaEsIOS()) {
   _pwaToast(
     '📱 En Safari: tocá <strong>compartir</strong> (□↑) → <strong>"Agregar a pantalla de inicio"</strong>',
     'info'
   );
   setTimeout(() => _pwaToastHide(), 7000);
   return;
 }

 if (!_pwaPrompt) {
 // Sin prompt nativo (ya instalada / navegador no compatible)
 _pwaToast(' Tocá el menú del navegador → "Agregar a pantalla de inicio"', 'info');
 setTimeout(() => _pwaToastHide(), 5000);
 return;
 }
 _pwaOcultarBanner();
 _pwaToast('<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(0,0,0,.2);border-top-color:#000;border-radius:50%;animation:pwaSpinner .7s linear infinite;vertical-align:middle;margin-right:4px;"></span> Descargando Marvel Food...', 'info');
 _pwaPrompt.prompt();
 const { outcome } = await _pwaPrompt.userChoice;
 if (outcome !== 'accepted') {
 _pwaToastHide();
 setTimeout(_pwaMostrarBanner, 1000);
 }
 _pwaPrompt = null;
};

// Botón cerrar (X) del banner 
window.pwaDismissBanner = () => {
 _pwaOcultarBanner();
 // No guardamos en localStorage → reaparece en la próxima sesión
};

// Registro del Service Worker 
// Ocultar splash cuando la página esté lista 
// OPTIMIZACIÓN: Splash se oculta cuando el contenido está REALMENTE listo 
(function() {
 let _splashHidden = false;

 function hideSplash() {
 if (_splashHidden) return;
 _splashHidden = true;
 const splash = document.getElementById('app-splash');
 if (!splash) return;
 splash.classList.add('hide');
 // Remover del DOM para liberar memoria
 setTimeout(() => { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 700);
 }

 // Estrategia: ocultar cuando el menú esté renderizado O a los 4s máximo
 let _splashTimeout = null;

 function scheduleHide(delay) {
 clearTimeout(_splashTimeout);
 _splashTimeout = setTimeout(hideSplash, delay || 500);
 }

 // DOMContentLoaded: el HTML está parseado, podemos comenzar
 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', function() {
 scheduleHide(400);
 });
 } else {
 scheduleHide(400);
 }

 // Fallback absoluto: a los 4s sí o sí (reducido de 5s)
 setTimeout(hideSplash, 4000);

 // Hook: ocultar cuando Firebase esté listo + menú renderizado
 document.addEventListener('firebase:ready', function() {
 scheduleHide(300);
 });
})();

if ('serviceWorker' in navigator) {
 window.addEventListener('load', () => {
 navigator.serviceWorker.register('./sw.js?v=7')
 .then(r => console.log('[SW] Registrado. Scope:', r.scope))
 .catch(e => console.warn('[SW] Error:', e));
 });
}

// Nav-cats: ocultar al bajar, mostrar al subir 
// OPTIMIZACIÓN: nav-cats cacheada fuera del scroll para no consultar DOM cientos de veces/seg 
(function() {
 // Cachear el elemento UNA SOLA VEZ al iniciar
 let navCats = null;
 let lastY = 0;
 let ticking = false;

 function initNavCatsScroll() {
 navCats = document.querySelector('.nav-cats');
 if (!navCats) return; // Si no existe en esta página, salir limpiamente

 window.addEventListener('scroll', () => {
 if (ticking) return;
 ticking = true;
 requestAnimationFrame(() => {
 const currentY = window.scrollY;
 if (currentY > 200) {
 if (currentY > lastY + 10) navCats.classList.add('hide-cats');
 else if (currentY < lastY - 5) navCats.classList.remove('hide-cats');
 } else {
 navCats.classList.remove('hide-cats');
 }
 lastY = currentY;
 ticking = false;
 });
 }, { passive: true });
 }

 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', initNavCatsScroll);
 } else {
 initNavCatsScroll();
 }
})();
