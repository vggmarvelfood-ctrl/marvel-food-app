// SISTEMA BÁSICO DE DIAGNÓSTICO DE ERRORES 
// Captura errores críticos antes del colapso del navegador
// y los almacena en localStorage para diagnóstico
(function _errorLogger() {
 var LOG_KEY = 'mf_error_log';
 var MAX_LOGS = 20;

 window._logError = function(tipo, mensaje, stack) {
 try {
 var logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
 logs.unshift({
 tipo: tipo || 'unknown',
 msg: (mensaje || '').slice(0, 300),
 stack: (stack || '').slice(0, 500),
 ua: navigator.userAgent.slice(0, 100),
 ts: new Date().toISOString(),
 mem: (window.performance && window.performance.memory)
 ? Math.round(window.performance.memory.usedJSHeapSize / 1048576) + 'MB'
 : 'N/A'
 });
 logs = logs.slice(0, MAX_LOGS);
 localStorage.setItem(LOG_KEY, JSON.stringify(logs));
 } catch(e) {}
 };

 // Capturar errores globales no manejados
 window.addEventListener('error', function(e) {
 window._logError('js_error', e.message, e.error ? e.error.stack : e.filename + ':' + e.lineno);
 });

 // Capturar promesas rechazadas
 window.addEventListener('unhandledrejection', function(e) {
 var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Promise rejected';
 window._logError('promise_rejection', msg, e.reason && e.reason.stack ? e.reason.stack : '');
 });

 // Exponer función para ver logs desde consola: mf_getLogs()
 window.mf_getLogs = function() {
 return JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
 };
 window.mf_clearLogs = function() {
 localStorage.removeItem(LOG_KEY);
 console.log('Logs limpiados');
 };
})();
</script>
<script>
// Detector de conexión en tiempo real 
(function() {
 function setBanner(isOffline) {
 var b = document.getElementById('offline-banner');
 if (b) b.classList.toggle('show', isOffline);
 }
 window.addEventListener('online', function() { setBanner(false); });
 window.addEventListener('offline', function() { setBanner(true); });
 if (!navigator.onLine) setBanner(true);

 // BARRERA ANTI-PANTALLA-BLANCA: si la página no se interactua en 12 segundos
 // y hay un splash visible, lo ocultamos para que el usuario vea el menú
 var _splashSafetyTimer = setTimeout(function() {
 try {
 var splash = document.getElementById('app-splash');
 if (splash && splash.style.display !== 'none') {
 splash.classList.add('hide');
 setTimeout(function() { splash.style.display = 'none'; }, 600);
 }
 } catch(e) {}
 }, 12000);
 window.addEventListener('load', function() { clearTimeout(_splashSafetyTimer); });
})();

// ═══════════════════════════════════════════════════════════════════
//  MEJORA 8 — Diagnósticos extendidos: red, memoria y timing
//  Ayuda a detectar problemas de performance en dispositivos de gama baja
// ═══════════════════════════════════════════════════════════════════

(function _extendedDiagnostics() {
  'use strict';

  /**
   * Captura métricas de performance una vez que la página carga.
   * Almacena en localStorage para revisión posterior.
   */
  window.addEventListener('load', function() {
    setTimeout(function() {
      try {
        var perf = window.performance;
        if (!perf) return;

        var nav = perf.getEntriesByType('navigation')[0];
        var metrics = {
          ts: new Date().toISOString(),
          // Tiempos de carga
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          loadComplete:     nav ? Math.round(nav.loadEventEnd) : null,
          // Memoria JS (solo Chrome/Android)
          jsHeapMB: (perf.memory)
            ? Math.round(perf.memory.usedJSHeapSize / 1048576)
            : null,
          jsHeapLimitMB: (perf.memory)
            ? Math.round(perf.memory.jsHeapSizeLimit / 1048576)
            : null,
          // Conexión de red (si disponible)
          connection: navigator.connection ? {
            effectiveType: navigator.connection.effectiveType,
            downlink:      navigator.connection.downlink,
            rtt:           navigator.connection.rtt,
            saveData:      navigator.connection.saveData,
          } : null,
          // User agent abreviado
          ua: navigator.userAgent.slice(0, 120),
        };

        var existing = [];
        try { existing = JSON.parse(localStorage.getItem('mf_perf_log') || '[]'); } catch(_) {}
        existing.unshift(metrics);
        existing = existing.slice(0, 10); // últimos 10 registros
        localStorage.setItem('mf_perf_log', JSON.stringify(existing));
      } catch(e) {}
    }, 2000);
  });

  // Exponer desde consola: mf_getPerfLogs()
  window.mf_getPerfLogs = function() {
    try { return JSON.parse(localStorage.getItem('mf_perf_log') || '[]'); }
    catch(_) { return []; }
  };

  /**
   * Detector de conexión lenta: si el usuario está en 2G o tiene
   * saveData activo, reducimos la calidad de precarga.
   */
  (function detectSlowConnection() {
    var conn = navigator.connection;
    if (!conn) return;

    var isSlow = conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g';
    if (isSlow) {
      document.documentElement.classList.add('slow-connection');
      console.log('[Diagnostics] Conexión lenta detectada. Modo ahorro activado.');
    }
  })();

})();
