/**
 * ============================================================
 *  MARVEL FOOD — MÓDULO DE GEO-FENCING DINÁMICO v2.0
 *  Reemplaza los polígonos estáticos de ZONA_POLIGONOS por
 *  datos vivos en Firebase/Firestore sincronizados desde KML.
 * ============================================================
 *
 *  DEPENDENCIAS (cargar antes de este archivo):
 *    - Turf.js v6:  https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js
 *    - toGeoJSON:   https://cdn.jsdelivr.net/npm/@tmcw/togeojson@5/dist/togeojson.umd.js
 *    - Firebase SDK modular 10.x (ya cargado en index.html)
 *    - Google Maps JS API con bibliotecas: drawing,visualization
 *
 *  USO RÁPIDO:
 *    // 1. Inicializar con la instancia db de Firebase ya existente
 *    GeoFencing.init(window.db);
 *
 *    // 2. (Primera vez / admin) Importar KML a Firestore
 *    await GeoFencing.syncMapData('/MAPA_ENVIOS_MARVEL_FOOD.kml');
 *
 *    // 3. Validar punto
 *    const result = await GeoFencing.determinarSucursal(-32.9312, -60.6609);
 *    // => { sucursal: 'Norte', zona: 'NORTE 1', requiresSpecialAccess: false }
 *
 *    // 4. Panel admin (solo ulises / leticia)
 *    GeoFencing.initAdminMapManager('map-div', { name: 'ulises' });
 *
 *    // 5. Heatmap sobre los polígonos
 *    GeoFencing.renderHeatmap(pedidosArray, map);
 * ============================================================
 */

const GeoFencing = (() => {

  // ── Mapeo Folder → Sucursal (basado en la estructura del KML) ──────────────
  const FOLDER_TO_SUCURSAL = {
    'rango envio norte':    'Norte',
    'mapa zona sur - galvez': 'Sur',
    'envio funes':          'Funes',
    'pellegrini':           'Centro',
  };

  // ── Palabras clave que indican acceso especial ─────────────────────────────
  const SPECIAL_ACCESS_KEYWORDS = ['barrio privado', 'golf club', 'countries', 'country'];

  // ── Referencia interna ────────────────────────────────────────────────────
  let _db        = null;   // instancia db compat (window.db del index)
  let _zonesCache = null;  // GeoJSON FeatureCollection cacheada
  let _adminMap  = null;   // instancia google.maps.Map del panel admin
  let _drawingMgr = null;  // DrawingManager
  let _heatmapLayer = null;

  // ── Usuarios autorizados para editar zonas ─────────────────────────────────
  const ADMIN_USERS = ['ulises', 'leticia'];

  // ===========================================================================
  //  HELPERS INTERNOS
  // ===========================================================================

  /** Normaliza texto para comparación: minúsculas, sin tildes */
  function _normalize(str = '') {
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /** Detecta si la descripción indica barrio privado u otro acceso especial */
  function _isSpecialAccess(description = '') {
    const d = _normalize(description);
    return SPECIAL_ACCESS_KEYWORDS.some(k => d.includes(k));
  }

  /** Infiere sucursal a partir del nombre de la zona */
  function _inferSucursal(zoneName = '', folderName = '') {
    const n = _normalize(zoneName);
    const f = _normalize(folderName);

    // Búsqueda directa por folder
    for (const [key, suc] of Object.entries(FOLDER_TO_SUCURSAL)) {
      if (f.includes(key) || n.includes(key.split(' ')[0])) return suc;
    }
    // Fallback por nombre de zona
    if (n.includes('norte') || n.includes('baigorria')) return 'Norte';
    if (n.includes('sur')   || n.includes('galvez') || n.includes('gálvez')) return 'Sur';
    if (n.includes('funes') || n.includes('fisherton')) return 'Funes';
    if (n.includes('pellegrini') || n.includes('centro')) return 'Centro';
    return 'Centro'; // fallback final
  }

  /** Convierte coordinates KML/GeoJSON [lng, lat, alt?] → Turf polygon ring */
  function _toTurfRing(coords) {
    return coords.map(([lng, lat]) => [lng, lat]);
  }

  // ===========================================================================
  //  1. syncMapData(kmlUrl)
  //     Parsea el KML, convierte a GeoJSON con toGeoJSON y persiste en Firestore
  //     Colección: delivery_zones / documentos: uno por Placemark
  // ===========================================================================

  /**
   * Sincroniza el KML con Firebase.
   * @param {string|File} kmlSource  URL del KML o File object (input file)
   * @param {object}      options    { overwrite: true } — si false, skip existentes
   * @returns {Promise<{ imported: number, skipped: number, errors: string[] }>}
   */
  async function syncMapData(kmlSource, options = { overwrite: true }) {
    if (!_db) throw new Error('GeoFencing: llamá primero a GeoFencing.init(db)');

    // ── Obtener texto del archivo (File o URL) ─────────────────────────────
    let fileText, fileName;
    if (kmlSource instanceof File) {
      fileText = await kmlSource.text();
      fileName = kmlSource.name || '';
    } else {
      const res = await fetch(kmlSource);
      if (!res.ok) throw new Error(`GeoFencing: fetch falló (${res.status})`);
      fileText = await res.text();
      fileName = String(kmlSource);
    }

    // ── Parsear KML o GeoJSON según extensión ─────────────────────────────
    // Integration Doc §3: soporte nativo .geojson sin toGeoJSON
    let geoJSON;
    const isGeoJSON = fileName.toLowerCase().endsWith('.geojson')
      || fileName.toLowerCase().endsWith('.json');

    if (isGeoJSON) {
      try {
        geoJSON = JSON.parse(fileText);
        if (geoJSON.type === 'Feature') {
          geoJSON = { type: 'FeatureCollection', features: [geoJSON] };
        }
        console.log('[GeoFencing] syncMapData: GeoJSON detectado — sin toGeoJSON');
      } catch (e) {
        throw new Error('GeoFencing: GeoJSON inválido — ' + e.message);
      }
    } else {
      // KML → requiere toGeoJSON
      if (typeof toGeoJSON === 'undefined') {
        throw new Error('GeoFencing: toGeoJSON no cargado. Incluí @tmcw/togeojson.');
      }
      const parser = new DOMParser();
      const kmlDOM = parser.parseFromString(fileText, 'application/xml');
      geoJSON = toGeoJSON.kml(kmlDOM);   // FeatureCollection
    }

    // ── Extraer nombres de Folder para inferir sucursal ───────────────────
    // toGeoJSON preserva folderName en properties cuando está disponible
    const stats = { imported: 0, skipped: 0, errors: [] };

    for (const feature of geoJSON.features) {
      if (!feature.geometry) {
        stats.skipped++;
        continue;
      }
      if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
        stats.skipped++;
        continue;
      }

      const props       = feature.properties || {};
      const name        = props.name || props.Name || 'Sin nombre';
      const description = props.description || props.Description || '';
      const folderName  = props.folder || props.Folder || '';
      const sucursal    = _inferSucursal(name, folderName);
      const specialAccess = _isSpecialAccess(description);

      // ID estable basado en el nombre (para evitar duplicados)
      const docId = _normalize(name).replace(/[^a-z0-9]/g, '_').substring(0, 60);

      const payload = {
        name,
        description,
        sucursal,
        requiresSpecialAccess: specialAccess,
        active: true,
        geometry: feature.geometry,   // GeoJSON geometry object
        updatedAt: new Date().toISOString(),
        source: 'kml_import',
      };

      try {
        if (options.overwrite) {
          await _db.collection('delivery_zones').doc(docId).set(payload, { merge: false });
        } else {
          const snap = await _db.collection('delivery_zones').doc(docId).get();
          if (snap.exists) { stats.skipped++; continue; }
          await _db.collection('delivery_zones').doc(docId).set(payload);
        }
        stats.imported++;
      } catch (err) {
        stats.errors.push(`${name}: ${err.message}`);
      }
    }

    // Invalidar caché local
    _zonesCache = null;
    console.log(`[GeoFencing] syncMapData: ${stats.imported} importadas, ${stats.skipped} omitidas, ${stats.errors.length} errores.`);
    return stats;
  }

  // ===========================================================================
  //  2. determinarSucursal(lat, lng)
  //     Point-in-Polygon con Turf.js contra las zonas activas de Firebase.
  //     Retorna { sucursal, zona, requiresSpecialAccess } o null si no cubre.
  // ===========================================================================

  /**
   * Determina a qué sucursal pertenece un punto geográfico.
   * Usa caché en memoria; invalida si no hay datos.
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<{sucursal:string, zona:string, requiresSpecialAccess:boolean}|null>}
   */
  async function determinarSucursal(lat, lng) {
    if (!_db) throw new Error('GeoFencing: llamá primero a GeoFencing.init(db)');
    if (typeof turf === 'undefined') {
      throw new Error('GeoFencing: Turf.js no cargado. Incluí @turf/turf.');
    }

    // Cargar/refrescar caché desde Firebase
    if (!_zonesCache) {
      _zonesCache = await _loadZonesFromFirebase();
    }

    if (!_zonesCache || _zonesCache.features.length === 0) {
      console.warn('[GeoFencing] No hay zonas en Firebase. Ejecutá syncMapData primero.');
      return null;
    }

    // Crear punto Turf [lng, lat] (orden GeoJSON)
    const punto = turf.point([lng, lat]);

    for (const feature of _zonesCache.features) {
      if (!feature.geometry) continue;
      if (!feature.properties?.active) continue;

      try {
        const poly = feature.geometry.type === 'MultiPolygon'
          ? turf.multiPolygon(feature.geometry.coordinates)
          : turf.polygon(feature.geometry.coordinates);

        const inside = turf.booleanPointInPolygon(punto, poly);
        if (inside) {
          return {
            sucursal:             feature.properties.sucursal,
            zona:                 feature.properties.name,
            requiresSpecialAccess: feature.properties.requiresSpecialAccess === true,
            description:          feature.properties.description || '',
          };
        }
      } catch (_) {
        // geometría inválida, ignorar
      }
    }

    // Fuera de cobertura — retornar sucursal más cercana como sugerencia
    const nearest = _nearestZone(lat, lng);
    return nearest
      ? { sucursal: nearest.sucursal, zona: null, requiresSpecialAccess: false, outOfRange: true, nearest: nearest.name }
      : null;
  }

  /** Carga todas las zonas activas de Firebase como GeoJSON FeatureCollection */
  async function _loadZonesFromFirebase() {
    const snap = await _db.collection('delivery_zones')
      .where('active', '==', true)
      .get();

    const features = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (!d.geometry) return;
      features.push({
        type: 'Feature',
        id: doc.id,
        properties: {
          name: d.name,
          description: d.description,
          sucursal: d.sucursal,
          requiresSpecialAccess: d.requiresSpecialAccess,
          active: d.active,
        },
        geometry: d.geometry,
      });
    });

    return { type: 'FeatureCollection', features };
  }

  /** Zona más cercana (por centroide) cuando el punto está fuera de cobertura */
  function _nearestZone(lat, lng) {
    if (!_zonesCache) return null;
    let best = null, bestDist = Infinity;
    for (const f of _zonesCache.features) {
      if (!f.geometry || !f.properties?.active) continue;
      try {
        const poly = f.geometry.type === 'MultiPolygon'
          ? turf.multiPolygon(f.geometry.coordinates)
          : turf.polygon(f.geometry.coordinates);
        const centroid = turf.centroid(poly);
        const dist = turf.distance(turf.point([lng, lat]), centroid);
        if (dist < bestDist) { bestDist = dist; best = f.properties; }
      } catch (_) {}
    }
    return best;
  }

  // ===========================================================================
  //  3A. initAdminMapManager(containerId, currentUser)
  //      Mapa admin con DrawingManager. Solo ulises/leticia pueden editar.
  // ===========================================================================

  /**
   * Inicializa el mapa de administración con DrawingManager.
   * @param {string} containerId  ID del div donde montar el mapa
   * @param {object} currentUser  Objeto { name: 'ulises' }
   * @param {object} mapOptions   Opciones extra para google.maps.Map
   */
  function initAdminMapManager(containerId, currentUser, mapOptions = {}) {
    if (!_db) throw new Error('GeoFencing: llamá primero a GeoFencing.init(db)');
    if (!window.google?.maps) {
      throw new Error('GeoFencing: Google Maps API no cargada.');
    }

    const canEdit = isAdmin(currentUser);

    // ── Crear mapa ────────────────────────────────────────────────────────
    _adminMap = new google.maps.Map(document.getElementById(containerId), {
      center:    { lat: -32.9468, lng: -60.6393 }, // Rosario
      zoom:      12,
      mapTypeId: 'roadmap',
      styles:    DARK_MAP_STYLES,
      ...mapOptions,
    });

    // ── Cargar polígonos existentes de Firebase ────────────────────────────
    _renderZonesOnMap(_adminMap, canEdit);

    if (!canEdit) {
      console.log('[GeoFencing] Vista de solo lectura — usuario sin permisos de edición.');
      _showToast('Modo solo lectura. Solo ulises y leticia pueden editar zonas.', 'info');
      return _adminMap;
    }

    // ── DrawingManager (solo para admins) ─────────────────────────────────
    _drawingMgr = new google.maps.drawing.DrawingManager({
      drawingMode: null, // ninguno por defecto
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [google.maps.drawing.OverlayType.POLYGON],
      },
      polygonOptions: {
        fillColor:    '#f59e0b',
        fillOpacity:  0.3,
        strokeColor:  '#f59e0b',
        strokeWeight: 2,
        editable:     true,
        draggable:    true,
        clickable:    true,
      },
    });
    _drawingMgr.setMap(_adminMap);

    // ── Evento: nuevo polígono dibujado ───────────────────────────────────
    google.maps.event.addListener(_drawingMgr, 'polygoncomplete', async (polygon) => {
      _drawingMgr.setDrawingMode(null);

      // Prompt para nombre de la zona
      const zoneName = prompt('Nombre de la nueva zona (ej: "NORTE 6"):', '');
      if (!zoneName?.trim()) {
        polygon.setMap(null);
        _showToast('Dibujado cancelado — ingresá un nombre para guardar.', 'warn');
        return;
      }

      const description = prompt('Descripción (ej: "BARRIO PRIVADO" o dejar vacío):', '') || '';
      const sucursal    = prompt('Sucursal (Centro / Norte / Sur / Funes):', _inferSucursal(zoneName)) || 'Centro';

      // Convertir vértices Google Maps → GeoJSON Polygon
      const path = polygon.getPath().getArray();
      const coords = path.map(latlng => [latlng.lng(), latlng.lat()]);
      coords.push(coords[0]); // cerrar anillo

      const geometry = { type: 'Polygon', coordinates: [coords] };
      const docId    = _normalize(zoneName).replace(/[^a-z0-9]/g, '_').substring(0, 60)
                       + '_' + Date.now();

      try {
        await _db.collection('delivery_zones').doc(docId).set({
          name:                 zoneName.trim(),
          description:          description.trim(),
          sucursal,
          requiresSpecialAccess: _isSpecialAccess(description),
          active:               true,
          geometry,
          createdBy:            currentUser.name,
          createdAt:            new Date().toISOString(),
          updatedAt:            new Date().toISOString(),
          source:               'admin_draw',
        });
        _zonesCache = null; // invalidar caché
        _showToast(`✅ Zona "${zoneName}" guardada en Firebase.`, 'success');

        // Estilizar el polígono recién guardado
        _styleAdminPolygon(polygon, zoneName, docId, sucursal, canEdit);
      } catch (err) {
        polygon.setMap(null);
        _showToast(`❌ Error al guardar: ${err.message}`, 'error');
      }
    });

    return _adminMap;
  }

  /** Renderiza todos los polígonos de Firebase sobre el mapa */
  async function _renderZonesOnMap(map, canEdit = false) {
    if (!_zonesCache) _zonesCache = await _loadZonesFromFirebase();
    if (!_zonesCache) return;

    const COLORS = {
      Norte:  '#3b82f6',
      Sur:    '#10b981',
      Funes:  '#a855f7',
      Centro: '#f59e0b',
    };

    for (const feature of _zonesCache.features) {
      if (!feature.geometry || feature.geometry.type !== 'Polygon') continue;

      const props   = feature.properties;
      const color   = COLORS[props.sucursal] || '#888888';
      const coords  = feature.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }));

      const poly = new google.maps.Polygon({
        paths:          coords,
        strokeColor:    color,
        strokeOpacity:  0.9,
        strokeWeight:   2,
        fillColor:      color,
        fillOpacity:    props.requiresSpecialAccess ? 0.45 : 0.2,
        editable:       canEdit,
        draggable:      false,
        map,
      });

      // Info window al hacer click
      const infoWindow = new google.maps.InfoWindow();
      google.maps.event.addListener(poly, 'click', (e) => {
        infoWindow.setContent(`
          <div style="font-family:sans-serif;padding:4px;">
            <strong>${props.name}</strong><br>
            Sucursal: <em>${props.sucursal}</em><br>
            ${props.requiresSpecialAccess ? '<span style="color:#ef4444">🔒 Acceso especial requerido</span>' : ''}
            ${props.description ? `<br><small>${props.description}</small>` : ''}
            ${canEdit ? `<br><br>
              <button onclick="GeoFencing._deleteZone('${feature.id}')" 
                style="background:#ef4444;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;">
                🗑 Eliminar zona
              </button>` : ''}
          </div>
        `);
        infoWindow.setPosition(e.latLng);
        infoWindow.open(map);
      });

      // Si se edita, persistir cambios en Firebase
      if (canEdit) {
        google.maps.event.addListener(poly.getPath(), 'set_at', () => _updateZoneGeometry(poly, feature.id));
        google.maps.event.addListener(poly.getPath(), 'insert_at', () => _updateZoneGeometry(poly, feature.id));
      }
    }
  }

  /** Persiste la geometría editada en Firebase */
  async function _updateZoneGeometry(polygon, docId) {
    const path   = polygon.getPath().getArray();
    const coords = path.map(ll => [ll.lng(), ll.lat()]);
    coords.push(coords[0]);
    try {
      await _db.collection('delivery_zones').doc(docId).update({
        geometry:  { type: 'Polygon', coordinates: [coords] },
        updatedAt: new Date().toISOString(),
      });
      _zonesCache = null;
      _showToast('Zona actualizada.', 'success');
    } catch (err) {
      _showToast(`Error al actualizar: ${err.message}`, 'error');
    }
  }

  /** Elimina una zona de Firebase (expuesto para los botones inline del InfoWindow) */
  async function _deleteZone(docId) {
    if (!confirm('¿Confirmar eliminación de esta zona?')) return;
    try {
      await _db.collection('delivery_zones').doc(docId).update({
        active:    false,
        updatedAt: new Date().toISOString(),
      });
      _zonesCache = null;
      _showToast('Zona desactivada.', 'success');
      // Recargar mapa
      if (_adminMap) {
        _adminMap.data.forEach(f => _adminMap.data.remove(f));
        _renderZonesOnMap(_adminMap, true);
      }
    } catch (err) {
      _showToast(`Error: ${err.message}`, 'error');
    }
  }

  function _styleAdminPolygon(polygon, name, docId, sucursal, canEdit) {
    const COLORS = { Norte:'#3b82f6', Sur:'#10b981', Funes:'#a855f7', Centro:'#f59e0b' };
    const color  = COLORS[sucursal] || '#f59e0b';
    polygon.setOptions({ strokeColor: color, fillColor: color });
  }

  // ===========================================================================
  //  3B. renderHeatmap(sourceData, map)
  //      Superpone HeatmapLayer sobre los polígonos de envío.
  // ===========================================================================

  /**
   * Renderiza un mapa de calor.
   * @param {Array} sourceData  Array de { lat, lng, weight? }
   *                            Puede ser pedidos completados o reclamos.
   * @param {google.maps.Map} map   Instancia del mapa (usa _adminMap si no se pasa)
   * @param {object}          opts  { radius:30, opacity:0.7, gradient:[] }
   */
  function renderHeatmap(sourceData, map = null, opts = {}) {
    const targetMap = map || _adminMap;
    if (!targetMap) throw new Error('GeoFencing: no hay mapa activo. Llamá initAdminMapManager primero o pasá el mapa.');
    if (!window.google?.maps?.visualization) {
      throw new Error('GeoFencing: cargá la librería "visualization" de Google Maps.');
    }

    // Limpiar heatmap anterior
    if (_heatmapLayer) {
      _heatmapLayer.setMap(null);
      _heatmapLayer = null;
    }

    if (!sourceData?.length) {
      _showToast('No hay datos para el mapa de calor.', 'warn');
      return null;
    }

    // Convertir array → WeightedLocation de Google Maps
    const dataPoints = sourceData
      .filter(p => p.lat != null && p.lng != null)
      .map(p => ({
        location: new google.maps.LatLng(p.lat, p.lng),
        weight:   p.weight ?? 1,
      }));

    _heatmapLayer = new google.maps.visualization.HeatmapLayer({
      data:    dataPoints,
      map:     targetMap,
      radius:  opts.radius  ?? 30,
      opacity: opts.opacity ?? 0.7,
      gradient: opts.gradient ?? [
        'rgba(0, 0, 0, 0)',
        'rgba(0, 100, 255, 0.5)',
        'rgba(0, 200, 255, 0.7)',
        'rgba(0, 255, 100, 0.8)',
        'rgba(255, 200, 0, 0.9)',
        'rgba(255, 100, 0, 1)',
        'rgba(255, 0, 0, 1)',
      ],
    });

    console.log(`[GeoFencing] Heatmap renderizado con ${dataPoints.length} puntos.`);
    return _heatmapLayer;
  }

  /** Toggle visibilidad del heatmap */
  function toggleHeatmap() {
    if (!_heatmapLayer) return;
    _heatmapLayer.setMap(_heatmapLayer.getMap() ? null : (_adminMap || null));
  }

  // ===========================================================================
  //  isAdmin(user) — Control de acceso
  // ===========================================================================

  /**
   * Verifica si el usuario tiene permisos de administración.
   * @param {object|string} user  { name: 'ulises' } o string 'ulises'
   */
  function isAdmin(user) {
    const name = (typeof user === 'string' ? user : user?.name ?? '').toLowerCase().trim();
    return ADMIN_USERS.includes(name);
  }

  // ===========================================================================
  //  Utilidades UI
  // ===========================================================================

  function _showToast(msg, type = 'info') {
    // Reutilizar el toast existente del index.html si existe
    const existingToast = document.getElementById('toast');
    if (existingToast) {
      existingToast.textContent = msg;
      existingToast.style.display = 'block';
      existingToast.style.background = type === 'error' ? '#ef4444'
        : type === 'success' ? '#10b981'
        : type === 'warn'    ? '#f59e0b'
        : '#3b82f6';
      setTimeout(() => { existingToast.style.display = 'none'; }, 3500);
      return;
    }
    // Crear toast temporal
    const el = document.createElement('div'); 
    Object.assign(el.style, {
      position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)',
      background: type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#f59e0b',
      color:'#000', padding:'10px 20px', borderRadius:'12px', fontWeight:'700',
      zIndex:'99999', fontSize:'13px', boxShadow:'0 4px 20px rgba(0,0,0,0.4)',
    });
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ===========================================================================
  //  Estilos oscuros para Google Maps (coherente con el tema Marvel Food)
  // ===========================================================================

  const DARK_MAP_STYLES = [
    { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#16213e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a3e' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212121' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c5e' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f2744' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  ];

  // ===========================================================================
  //  API PÚBLICA
  // ===========================================================================

  return {
    /**
     * Inicializa el módulo con la instancia db ya existente en el index.
     * @param {object} dbInstance  window.db (wrapper compat de Firebase)
     */
    init(dbInstance) {
      _db = dbInstance;
      console.log('[GeoFencing] Módulo inicializado. db:', !!_db);
    },

    /** Invalida la caché local (fuerza re-fetch en próxima consulta) */
    invalidateCache() { _zonesCache = null; },

    /** Devuelve el GeoJSON cacheado (o lo carga si no existe) */
    async getZones() {
      if (!_zonesCache) _zonesCache = await _loadZonesFromFirebase();
      return _zonesCache;
    },

    syncMapData,
    determinarSucursal,
    initAdminMapManager,
    renderHeatmap,
    toggleHeatmap,
    isAdmin,

    // Exponer para botones inline en InfoWindow
    _deleteZone,
  };

})();

// Exponer globalmente
window.GeoFencing = GeoFencing;
