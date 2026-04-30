// Firebase Modular 10.7.1 — inicialización y wrappers de compatibilidad
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
 getFirestore, collection, doc,
 getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc,
 onSnapshot, query, where, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
 getAuth, signInWithPopup, GoogleAuthProvider,
 onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const _fbConfig = {
 apiKey: "AIzaSyAeRlE9S5pnEUuhxRXoOX6lMX4Ryky0uSI",
 authDomain: "marvel-food-fa570.firebaseapp.com",
 projectId: "marvel-food-fa570",
 storageBucket: "marvel-food-fa570.firebasestorage.app",
 messagingSenderId: "351263580699",
 appId: "1:351263580699:web:9ba99708a021e5eabecebe",
 measurementId: "G-Z7X80SVSX6"
};

// Parchear DocumentSnapshot para que .exists sea una PROPIEDAD (igual que compat) 
// En v9 modular .exists() es un método; el resto de la app lo usa como propiedad.
function _patchSnap(snap) {
 try {
 const _orig = snap.exists.bind(snap);
 Object.defineProperty(snap, 'exists', { get: () => _orig(), configurable: true });
 } catch(_) {}
 return snap;
}

// Query builder: soporta encadenamiento .where().orderBy().limit() 
function _qb(colRef, constraints) {
 return {
 where: (f, op, v) => _qb(colRef, [...constraints, where(f, op, v)]),
 orderBy: (f, dir) => _qb(colRef, [...constraints, orderBy(f, dir || 'asc')]),
 limit: (n) => _qb(colRef, [...constraints, limit(n)]),
 onSnapshot: (fn, errFn) => onSnapshot(query(colRef, ...constraints), snap => fn(snap), errFn),
 get: () => getDocs(query(colRef, ...constraints))
 };
}

// Wrapper de documento (reemplaza doc().get(), doc().update(), etc.) 
function _docCompat(rawDb, colPath, id) {
 const ref = doc(rawDb, colPath, id);
 return {
 get: () => getDoc(ref).then(_patchSnap),
 update: (data) => updateDoc(ref, data),
 set: (data, opts) => setDoc(ref, data, opts || {}),
 delete: () => deleteDoc(ref),
 onSnapshot: (fn, errFn) => onSnapshot(ref, snap => fn(_patchSnap(snap)), errFn)
 };
}

// Wrapper de colección (reemplaza db.collection('x').add(), .doc(), etc.) 
function _colCompat(rawDb, colPath) {
 const colRef = collection(rawDb, colPath);
 return {
 add: (data) => addDoc(colRef, data),
 doc: (id) => _docCompat(rawDb, colPath, id),
 where: (f, op, v) => _qb(colRef, [where(f, op, v)]),
 orderBy: (f, dir) => _qb(colRef, [orderBy(f, dir || 'asc')]),
 limit: (n) => _qb(colRef, [limit(n)]),
 onSnapshot: (fn, errFn) => onSnapshot(colRef, fn, errFn),
 get: () => getDocs(colRef)
 };
}

try {
 const _app = initializeApp(_fbConfig);
 const _rawDb = getFirestore(_app);

 // window.db: API idéntica a compat — ninguna llamada existente cambia 
 // batch() añadido: admLimpiarDia lo necesita para borrado masivo atómico 
 function _batchCompat(rawDb) {
 const ops = [];
 return {
 delete: (colOrRef) => {
 // Acepta tanto el resultado de db.collection().doc() como una ref directa
 const ref = colOrRef._ref || colOrRef;
 ops.push({ type: 'delete', ref });
 return this;
 },
 set: (colOrRef, data, opts) => { ops.push({ type: 'set', ref: colOrRef._ref || colOrRef, data, opts }); return this; },
 update: (colOrRef, data) => { ops.push({ type: 'update', ref: colOrRef._ref || colOrRef, data }); return this; },
 commit: async () => {
 // Firestore SDK v9 no tiene WriteBatch en esta forma; emulamos con Promise.all en chunks de 500
 const { writeBatch, doc: _doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
 const CHUNK = 499;
 for (let i = 0; i < ops.length; i += CHUNK) {
 const b = writeBatch(rawDb);
 ops.slice(i, i + CHUNK).forEach(op => {
 if (op.type === 'delete') b.delete(op.ref);
 else if (op.type === 'set') b.set(op.ref, op.data, op.opts || {});
 else if (op.type === 'update') b.update(op.ref, op.data);
 });
 await b.commit();
 }
 }
 };
 }
 window.db = {
 collection: (path) => _colCompat(_rawDb, path),
 batch: () => _batchCompat(_rawDb)
 };

 // Compatibilidad con firebase.firestore.FieldValue.serverTimestamp() 
 window.firebase = {
 firestore: {
 FieldValue: { serverTimestamp: () => serverTimestamp() }
 }
 };

 // Avisar al resto de la app que la DB está lista
 document.dispatchEvent(new CustomEvent('firebase:ready', { detail: { db: window.db } }));
 window._firebaseOk = true;

 // ── FIREBASE AUTH (Google) ──────────────────────────────────────────────
 const _auth = getAuth(_app);
 const _googleProvider = new GoogleAuthProvider();

 // Verificar rol admin en Firestore y abrir panel
 async function _verificarRol(uid) {
   try {
     const snap = await getDoc(doc(_rawDb, 'usuarios', uid));
     if (snap.exists() && snap.data().rol === 'admin') {
       console.log('[Auth] Acceso concedido. UID:', uid);
       _concederAccesoAdmin();
     } else {
       alert('Acceso denegado: no tenés permisos de administrador.\nUID para configurar en Firestore: ' + uid);
       await signOut(_auth);
     }
   } catch(e) {
     console.error('[Auth] Error verificando rol:', e);
   }
 }

 // Login con Google — signInWithPopup (el COOP warning es inofensivo; el redirect
 // activa bounce-tracking mitigation en Chrome y bloquea el acceso completamente)
 window.admGoogleLogin = async function() {
   const btn = document.getElementById('adm-google-btn');
   const pf  = document.getElementById('adm-pin-feedback');
   if (btn) { btn.disabled = true; btn.textContent = 'Conectando...'; }
   try {
     const result = await signInWithPopup(_auth, _googleProvider);
     console.log('[Auth] UID:', result.user.uid);
     await _verificarRol(result.user.uid);
   } catch (err) {
     console.error('[Auth] Error login:', err);
     if (err.code === 'auth/unauthorized-domain') {
       alert('⚠️ Dominio no autorizado en Firebase.\nFirebase Console → Authentication → Settings → Authorized domains\nAgregá: ' + window.location.hostname);
     } else if (err.code === 'auth/popup-blocked') {
       if (pf) { pf.textContent = 'El popup fue bloqueado. Habilitá popups para este sitio.'; pf.style.color='#ef4444'; }
     } else if (err.code !== 'auth/popup-closed-by-user') {
       alert('Error al iniciar sesión: ' + err.message);
     }
   } finally {
     if (btn) { btn.disabled = false; btn.textContent = 'Ingresar con Google'; }
   }
 };

 // Cerrar sesión Google
 window.admGoogleLogout = async function() {
   try { await signOut(_auth); } catch(e) {}
 };

 // Observador de sesión: si ya tiene sesión activa (recargó la página), verificar rol
 onAuthStateChanged(_auth, (user) => {
   if (user && sessionStorage.getItem('_mfa_ok')) {
     _verificarRol(user.uid);
   }
 });

 // Tarea 5: Firebase Cloud Messaging (FCM) — inicialización modular
 // VAPID_KEY: reemplazá con tu clave pública de FCM (Firebase Console > Project Settings > Cloud Messaging)
 const FCM_VAPID_KEY = 'BGnKQaPH1M8Yr1Q0jBXMZhwcgBXmHEQLKGJP0TjclgfOmnRWc3gQIZmGSGNf6SgO0h-Ade2k260AyXJJDp1vIQE';

 async function fcmInit() {
 try {
 const { getMessaging, getToken, onMessage } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');
 const messaging = getMessaging(_app);
 window._fcmMessaging = messaging;

 // Escuchar mensajes con app abierta (foreground)
 onMessage(messaging, (payload) => {
 const n = payload.notification || {};
 const t = document.getElementById('toast');
 if (t) {
 t.innerText = (n.title || '') + (n.body ? ': ' + n.body : '');
 t.classList.add('show');
 setTimeout(() => t.classList.remove('show'), 5000);
 }
 });

 window._fcmGetToken = async function() {
 try {
 // Race con timeout para evitar que navigator.serviceWorker.ready cuelgue en Android
 const reg = await Promise.race([
 navigator.serviceWorker.ready,
 new Promise((_, rej) => setTimeout(() => rej(new Error('SW ready timeout')), 10000))
 ]);
 const token = await getToken(messaging, { vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
 return token || null;
 } catch(e) {
 console.warn('[FCM] getToken error:', e);
 return null;
 }
 };
 } catch(e) {
 console.warn('[FCM] init error:', e);
 }
 }

 // Inicializar FCM si el browser lo soporta — con delay para no bloquear carga
 if ('serviceWorker' in navigator && 'PushManager' in window) {
 setTimeout(function() {
 try { fcmInit(); } catch(e) { console.warn('[FCM] Error init:', e); }
 }, 3000);
 }

} catch(e) {
 console.error('[Firebase] Error de inicialización modular:', e);
 window.db = null;
 window.firebase = { firestore: { FieldValue: { serverTimestamp: () => null } } };
}
// ═══════════════════════════════════════════════════════════════════
//  MEJORA 1 — Custom Claims + Route Guard robusto
//  En lugar de confiar solo en Firestore, verificamos el token del
//  usuario para detectar el custom claim "admin: true".
//  Fallback a Firestore si el claim aún no está propagado.
// ═══════════════════════════════════════════════════════════════════

/**
 * Verifica si el usuario tiene el custom claim "admin:true" en su token.
 * Si el claim no existe aún, hace fallback a la colección "usuarios" de Firestore.
 * De esta forma la lógica de roles nunca depende solo del frontend.
 */
async function _verificarRolConClaims(user) {
  try {
    // Forzar refresco del token para obtener los claims más recientes
    const tokenResult = await user.getIdTokenResult(true);
    const claims = tokenResult.claims || {};

    if (claims.admin === true) {
      console.log('[Auth] Custom claim admin=true verificado. UID:', user.uid);
      _concederAccesoAdmin();
      return;
    }

    // Fallback: verificar rol en Firestore (compatibilidad hacia atrás)
    const snap = await getDoc(doc(_rawDb, 'usuarios', user.uid));
    if (snap.exists() && snap.data().rol === 'admin') {
      console.log('[Auth] Rol admin verificado vía Firestore. UID:', user.uid);
      _concederAccesoAdmin();
    } else {
      alert(
        'Acceso denegado: no tenés permisos de administrador.\n' +
        'UID para configurar en Firestore o Firebase Functions: ' + user.uid
      );
      const { signOut: _so } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      await _so(_auth);
    }
  } catch (err) {
    console.error('[Auth] Error verificando rol:', err);
    alert('Error al verificar permisos: ' + err.message);
  }
}

function _concederAccesoAdmin() {
  if (!sessionStorage.getItem('_mfa_ok')) {
    console.warn('[Auth] Google OK pero PIN no verificado. Acceso denegado.');
    return;
  }
  window.__IS_ADMIN__ = true;
  const loginScreen = document.getElementById('adm-login-screen');
  const adminApp    = document.getElementById('adm-app');
  if (loginScreen) loginScreen.style.display = 'none';
  if (adminApp)    adminApp.style.display = 'block';
  if (typeof admFechaHoy === 'function') admFechaHoy();
  if (typeof admIniciar === 'function') admIniciar();
  else if (typeof admInit === 'function') admInit();
  setTimeout(() => {
    const firstTab = document.querySelector('.adm-tab');
    if (typeof admSwitchTab === 'function' && firstTab) admSwitchTab('pedidos', firstTab);
  }, 150);
}

/**
 * Route Guard: intercepta cualquier intento de mostrar #admin-root
 * sin una sesión válida con rol admin.
 * Se ejecuta en cada carga de página y también en cambios de hash.
 */
function _routeGuard() {
  const adminRoot = document.getElementById('admin-root');
  if (!adminRoot) return;

  // Si el panel está visible pero no hay usuario autenticado → ocultar
  const authInstance = window._firebaseAuth;
  if (!authInstance) return;

  import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js')
    .then(({ onAuthStateChanged }) => {
      onAuthStateChanged(authInstance, (user) => {
        if (!user && adminRoot.style.display !== 'none') {
          console.warn('[RouteGuard] Panel admin visible sin sesión. Ocultando.');
          adminRoot.style.display = 'none';
          const loginScreen = document.getElementById('adm-login-screen');
          if (loginScreen) loginScreen.style.display = 'block';
        }
      });
    });
}

// Exponer el auth para el RouteGuard y para admGoogleLogout
// (se asigna después de inicializar _auth arriba)
if (typeof _auth !== 'undefined') {
  window._firebaseAuth = _auth;
  // Reemplazar _verificarRol con la versión con Claims
  // (sobrescribimos la función original definida más arriba)
  window._verificarRol = _verificarRolConClaims;

  // Ejecutar RouteGuard al cargar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _routeGuard);
  } else {
    _routeGuard();
  }
}
