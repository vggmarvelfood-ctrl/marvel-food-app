// adm-pin-system.js
// Sistema de autenticación de 2 factores para panel admin
// Uso: Cargar este script DESPUÉS de firebase-config.js y ANTES de app.js

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  CONFIGURACIÓN
  // ═══════════════════════════════════════════════════════════════════
  
  // ⚠️ CAMBIAR ESTE PIN POR UNO SEGURO Y GUARDARLO EN LUGAR SEGURO
  // Para más seguridad, podría almacenarse en Firebase o como variable de entorno
  const PIN_CORRECTO = '1234'; // ← MODIFICAR AQUÍ
  
  // Número de intentos permitidos antes de bloqueo temporal
  const MAX_INTENTOS = 3;
  
  // Tiempo de bloqueo en milisegundos (5 minutos)
  const TIEMPO_BLOQUEO = 5 * 60 * 1000;

  // ═══════════════════════════════════════════════════════════════════
  //  ESTADO INTERNO
  // ═══════════════════════════════════════════════════════════════════
  
  let intentosFallidos = 0;
  let tiempoBloqueo = null;

  // ═══════════════════════════════════════════════════════════════════
  //  FUNCIONES DE VALIDACIÓN
  // ═══════════════════════════════════════════════════════════════════

  function estaBloqueo() {
    if (!tiempoBloqueo) return false;
    
    const ahora = Date.now();
    if (ahora < tiempoBloqueo) {
      const segundosRestantes = Math.ceil((tiempoBloqueo - ahora) / 1000);
      return segundosRestantes;
    }
    
    // El bloqueo expiró
    tiempoBloqueo = null;
    intentosFallidos = 0;
    return false;
  }

  function validarPIN(pinIngresado) {
    // Verificar bloqueo
    const bloqueo = estaBloqueo();
    if (bloqueo) {
      return {
        valido: false,
        mensaje: `Bloqueado por seguridad. Intentá de nuevo en ${bloqueo} segundos.`,
        bloqueado: true
      };
    }

    // Validar PIN
    if (pinIngresado === PIN_CORRECTO) {
      // PIN correcto - resetear intentos
      intentosFallidos = 0;
      tiempoBloqueo = null;
      
      return {
        valido: true,
        mensaje: 'PIN correcto. Acceso concedido.'
      };
    }

    // PIN incorrecto - incrementar contador
    intentosFallidos++;
    
    if (intentosFallidos >= MAX_INTENTOS) {
      tiempoBloqueo = Date.now() + TIEMPO_BLOQUEO;
      
      return {
        valido: false,
        mensaje: `Demasiados intentos fallidos. Bloqueado por 5 minutos.`,
        bloqueado: true
      };
    }

    return {
      valido: false,
      mensaje: `PIN incorrecto. Intentos restantes: ${MAX_INTENTOS - intentosFallidos}`,
      bloqueado: false
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  UI - MOSTRAR/OCULTAR SECCIÓN PIN
  // ═══════════════════════════════════════════════════════════════════

  function mostrarSeccionPIN() {
    const pinSection = document.getElementById('adm-pin-section');
    const googleBtn = document.getElementById('adm-google-btn');
    
    if (pinSection) {
      pinSection.style.display = 'block';
      
      // Animar entrada
      pinSection.style.opacity = '0';
      pinSection.style.transform = 'translateY(-10px)';
      
      setTimeout(() => {
        pinSection.style.transition = 'all 0.3s ease';
        pinSection.style.opacity = '1';
        pinSection.style.transform = 'translateY(0)';
        
        // Focus en input
        const input = document.getElementById('adm-pin-input');
        if (input) input.focus();
      }, 50);
    }
    
    // Ocultar botón de Google
    if (googleBtn) {
      googleBtn.style.display = 'none';
    }
  }

  function ocultarSeccionPIN() {
    const pinSection = document.getElementById('adm-pin-section');
    const googleBtn = document.getElementById('adm-google-btn');
    
    if (pinSection) pinSection.style.display = 'none';
    if (googleBtn) googleBtn.style.display = 'block';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  FUNCIÓN PRINCIPAL DE VERIFICACIÓN
  // ═══════════════════════════════════════════════════════════════════

  window.admVerifyPin = function() {
    const input = document.getElementById('adm-pin-input');
    const feedback = document.getElementById('adm-pin-feedback');
    const btnVerificar = document.querySelector('#adm-pin-section button');
    
    if (!input || !feedback) {
      console.error('[PIN] Elementos UI no encontrados');
      return;
    }

    const pinIngresado = input.value.trim();
    
    if (!pinIngresado) {
      feedback.style.color = '#ef4444';
      feedback.textContent = 'Ingresá el PIN';
      return;
    }

    // Deshabilitar botón durante validación
    if (btnVerificar) {
      btnVerificar.disabled = true;
      btnVerificar.textContent = 'Verificando...';
    }

    // Validar PIN
    const resultado = validarPIN(pinIngresado);
    
    if (resultado.valido) {
      // ✅ PIN CORRECTO
      feedback.style.color = '#10b981';
      feedback.textContent = '✓ ' + resultado.mensaje;
      
      // Guardar en sessionStorage
      sessionStorage.setItem('_mfa_ok', '1');
      
      // Limpiar input
      input.value = '';
      
      // Recargar página para que _concederAccesoAdmin se ejecute
      setTimeout(() => {
        window.location.reload();
      }, 800);
      
    } else {
      // ❌ PIN INCORRECTO
      feedback.style.color = '#ef4444';
      feedback.textContent = '✗ ' + resultado.mensaje;
      
      // Limpiar input
      input.value = '';
      
      // Re-habilitar botón (si no está bloqueado)
      if (btnVerificar && !resultado.bloqueado) {
        btnVerificar.disabled = false;
        btnVerificar.textContent = 'VERIFICAR PIN';
      }
      
      // Si está bloqueado, actualizar botón
      if (btnVerificar && resultado.bloqueado) {
        btnVerificar.disabled = true;
        btnVerificar.textContent = 'BLOQUEADO';
        btnVerificar.style.background = '#ef4444';
        
        // Revertir estilo después del bloqueo
        setTimeout(() => {
          btnVerificar.disabled = false;
          btnVerificar.textContent = 'VERIFICAR PIN';
          btnVerificar.style.background = '#f59e0b';
        }, TIEMPO_BLOQUEO);
      }
      
      // Focus para nuevo intento
      input.focus();
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  //  PARCHEAR admGoogleLogin PARA MOSTRAR PIN DESPUÉS DE GOOGLE
  // ═══════════════════════════════════════════════════════════════════

  // Esperar a que admGoogleLogin esté disponible
  function patchGoogleLogin() {
    if (typeof window.admGoogleLogin !== 'function') {
      setTimeout(patchGoogleLogin, 200);
      return;
    }

    const originalGoogleLogin = window.admGoogleLogin;
    
    window.admGoogleLogin = async function() {
      try {
        // Ejecutar login original
        await originalGoogleLogin();
        
        // Si llegó aquí, el login con Google fue exitoso
        // Mostrar formulario de PIN
        mostrarSeccionPIN();
        
      } catch (err) {
        console.error('[PIN] Error en login Google:', err);
        // No mostrar PIN si falló Google
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  INICIALIZACIÓN
  // ═══════════════════════════════════════════════════════════════════

  function inicializar() {
    // Verificar si ya tiene sesión de PIN válida
    if (sessionStorage.getItem('_mfa_ok')) {
      console.log('[PIN] Sesión PIN válida detectada');
      return;
    }

    // Parchear función de login Google
    patchGoogleLogin();
    
    console.log('[PIN] Sistema de autenticación 2FA inicializado');
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  UTILIDADES DE DESARROLLO
  // ═══════════════════════════════════════════════════════════════════

  // Resetear bloqueo desde consola (solo desarrollo)
  window.admResetPinLock = function() {
    intentosFallidos = 0;
    tiempoBloqueo = null;
    console.log('[PIN] Bloqueo reseteado');
  };

  // Cambiar PIN desde consola (solo desarrollo)
  window.admChangePinDev = function(nuevoPin) {
    if (typeof nuevoPin === 'string' && nuevoPin.length >= 4) {
      // ⚠️ Solo para desarrollo - NO usar en producción
      console.warn('[PIN] Cambio de PIN temporal - recargá la página para revertir');
      window._tempPin = nuevoPin;
    }
  };

})();
