import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import './App.css';
import { Search, MapPin, Map as MapIcon, ChevronUp, Check, X, Plus, Trash2, Bookmark } from 'lucide-react';
import { getAllPins, addPin as dbAddPin, deletePin as dbDeletePin } from './db';

// Lazy-load the heavy map module (leaflet + plugins ~700kB)
const MapComponent = lazy(() => import('./MapComponent'));

const unespBuildings = [
  { id: '1', name: 'Bosque', description: 'Bosque do Campus UNESP Bauru.', coords: [-22.349968, -49.031761], isDefault: true },
  { id: '2', name: 'Restaurante Universitário (RU)', description: '', coords: [-22.346682, -49.031271], isDefault: true },
  { id: '4', name: 'Lab design contemporaneo', description: '', coords: [-22.348733, -49.032077], isDefault: true },
  { id: '6', name: 'Cantina', description: '', coords: [-22.347223, -49.030804], isDefault: true },
];

// Bottom sheet snap points
const SNAP_CLOSED = 9;
const SNAP_HALF = 45;
const SNAP_FULL = 85;

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPoi, setSelectedPoi] = useState(null);
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [welcomeExiting, setWelcomeExiting] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Custom pins (loaded from IndexedDB)
  const [customPins, setCustomPins] = useState([]);
  const [addPinModal, setAddPinModal] = useState(null); // { lat, lng } or null
  const [pinName, setPinName] = useState('');
  const [pinDesc, setPinDesc] = useState('');
  const pinNameInputRef = useRef(null);

  // --- Bottom Sheet Gesture State ---
  const sheetRef = useRef(null);
  const sheetContentRef = useRef(null);
  const [sheetHeight, setSheetHeight] = useState(SNAP_CLOSED);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ y: 0, height: 0 });
  const velocityRef = useRef({ lastY: 0, lastTime: 0, velocity: 0 });
  const isSheetOpen = sheetHeight > SNAP_CLOSED + 10;

  // Active tab for the sheet
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'saved'

  // Load custom pins from IndexedDB on mount
  useEffect(() => {
    getAllPins().then(setCustomPins).catch(console.warn);
  }, []);

  // Combine all POIs for display
  const allPois = [...unespBuildings, ...customPins.map(p => ({ ...p, isCustom: true }))];

  const filteredBuildings = allPois.filter(poi => {
    const matchesSearch = poi.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (poi.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (activeTab === 'saved') return matchesSearch && poi.isCustom;
    return matchesSearch;
  });

  const handlePoiSelect = (poi) => {
    setSelectedPoi(poi);
    setSheetHeight(SNAP_CLOSED);
  };

  const dismissWelcome = () => {
    setWelcomeExiting(true);
    setTimeout(() => setWelcomeOpen(false), 400);
  };

  // --- Custom Pin Functions (IndexedDB) ---
  const handleAddPin = useCallback((lat, lng) => {
    setAddPinModal({ lat, lng });
    setPinName('');
    setPinDesc('');
    setTimeout(() => pinNameInputRef.current?.focus(), 100);
  }, []);

  const handleSavePin = async () => {
    if (!pinName.trim() || !addPinModal) return;

    const newPin = {
      id: `custom-${Date.now()}`,
      name: pinName.trim(),
      description: pinDesc.trim() || 'Local salvo pelo usuário',
      coords: [addPinModal.lat, addPinModal.lng],
      isCustom: true,
      createdAt: new Date().toISOString(),
    };

    try {
      await dbAddPin(newPin);
      setCustomPins(prev => [...prev, newPin]);
    } catch (e) {
      console.error('Failed to save pin:', e);
    }

    setAddPinModal(null);
    setPinName('');
    setPinDesc('');
  };

  const handleDeletePin = useCallback(async (pinId) => {
    try {
      await dbDeletePin(pinId);
      setCustomPins(prev => prev.filter(p => p.id !== pinId));
    } catch (e) {
      console.error('Failed to delete pin:', e);
    }
  }, []);

  const handleCancelPin = () => {
    setAddPinModal(null);
    setPinName('');
    setPinDesc('');
  };

  // --- Touch Gesture Handlers for Bottom Sheet ---
  const handleTouchStart = useCallback((e) => {
    const contentEl = sheetContentRef.current;
    if (contentEl && contentEl.contains(e.target) && contentEl.scrollTop > 0) return;
    const touch = e.touches[0];
    dragStartRef.current = { y: touch.clientY, height: sheetHeight };
    velocityRef.current = { lastY: touch.clientY, lastTime: Date.now(), velocity: 0 };
    setIsDragging(true);
  }, [sheetHeight]);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const deltaY = dragStartRef.current.y - touch.clientY;
    const deltaPercent = (deltaY / window.innerHeight) * 100;
    const newHeight = Math.max(SNAP_CLOSED, Math.min(SNAP_FULL + 5, dragStartRef.current.height + deltaPercent));

    const now = Date.now();
    const dt = now - velocityRef.current.lastTime;
    if (dt > 0) {
      velocityRef.current.velocity = (velocityRef.current.lastY - touch.clientY) / dt;
      velocityRef.current.lastY = touch.clientY;
      velocityRef.current.lastTime = now;
    }
    setSheetHeight(newHeight);
    e.preventDefault();
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const velocity = velocityRef.current.velocity;
    const h = sheetHeight;

    if (velocity > 0.5) { setSheetHeight(h < SNAP_HALF ? SNAP_HALF : SNAP_FULL); return; }
    if (velocity < -0.5) { setSheetHeight(h > SNAP_HALF ? SNAP_HALF : SNAP_CLOSED); return; }

    if (h < (SNAP_CLOSED + SNAP_HALF) / 2) setSheetHeight(SNAP_CLOSED);
    else if (h < (SNAP_HALF + SNAP_FULL) / 2) setSheetHeight(SNAP_HALF);
    else setSheetHeight(SNAP_FULL);
  }, [isDragging, sheetHeight]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
    sheet.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      sheet.removeEventListener('touchstart', handleTouchStart);
      sheet.removeEventListener('touchmove', handleTouchMove);
      sheet.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const handleHeaderClick = () => {
    if (isDragging) return;
    setSheetHeight(sheetHeight > SNAP_CLOSED + 10 ? SNAP_CLOSED : SNAP_HALF);
  };

  return (
    <div className="app-container">

      {/* Search Bar — hidden during navigation */}
      {!isNavigating && (
        <div className={`search-container ${searchFocused ? 'focused' : ''}`}>
          <Search className="search-icon" size={20} />
          <input
            type="text"
            placeholder="Buscar locais no campus..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => { setSearchFocused(true); setSheetHeight(SNAP_HALF); }}
            onBlur={() => setSearchFocused(false)}
          />
          {searchTerm && (
            <button className="search-clear-btn" onClick={() => setSearchTerm('')} aria-label="Limpar busca">
              <X size={18} />
            </button>
          )}
        </div>
      )}

      {/* Map Module — lazy-loaded for code splitting */}
      <Suspense fallback={
        <div className="map-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8eef4' }}>
          <div style={{ textAlign: 'center', color: '#6b7280' }}>
            <MapPin size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p style={{ fontSize: '0.85rem', fontWeight: 500 }}>Carregando mapa…</p>
          </div>
        </div>
      }>
        <MapComponent
          pois={allPois}
          selectedPoi={selectedPoi}
          onAddPin={handleAddPin}
          onDeletePin={handleDeletePin}
          onNavigatingChange={setIsNavigating}
        />
      </Suspense>

      {/* Add Pin Modal */}
      {addPinModal && (
        <div className="modal-overlay" onClick={handleCancelPin}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon">
                <MapPin size={24} />
              </div>
              <h3>Salvar Local</h3>
            </div>

            <div className="modal-body">
              <div className="modal-field">
                <label>Nome do local</label>
                <input
                  ref={pinNameInputRef}
                  type="text"
                  placeholder="Ex: Sala de estudos, Estacionamento..."
                  value={pinName}
                  onChange={(e) => setPinName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSavePin()}
                  maxLength={50}
                  autoFocus
                />
              </div>
              <div className="modal-field">
                <label>Descrição <span>(opcional)</span></label>
                <input
                  type="text"
                  placeholder="Uma breve descrição..."
                  value={pinDesc}
                  onChange={(e) => setPinDesc(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSavePin()}
                  maxLength={100}
                />
              </div>
              <div className="modal-coords">
                📍 {addPinModal.lat.toFixed(6)}, {addPinModal.lng.toFixed(6)}
              </div>
            </div>

            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={handleCancelPin}>
                Cancelar
              </button>
              <button
                className="modal-btn-save"
                onClick={handleSavePin}
                disabled={!pinName.trim()}
              >
                <Plus size={18} />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet — hidden during navigation */}
      {!isNavigating && (
        <div
          ref={sheetRef}
          className={`bottom-sheet ${isDragging ? 'dragging' : ''}`}
          style={{ height: `${sheetHeight}vh` }}
        >
          {isSheetOpen && (
            <div className="sheet-backdrop" onClick={() => setSheetHeight(SNAP_CLOSED)} />
          )}
          <div className="sheet-header" onClick={handleHeaderClick}>
            <div className="sheet-header-inner">
              <div className="drag-handle" />
              <div className="sheet-title">
                <span>Explorar Locais</span>
                <span className="sheet-count">{filteredBuildings.length} locais</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="sheet-tabs">
            <button
              className={`sheet-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              <MapPin size={14} />
              Todos
            </button>
            <button
              className={`sheet-tab ${activeTab === 'saved' ? 'active' : ''}`}
              onClick={() => setActiveTab('saved')}
            >
              <Bookmark size={14} />
              Salvos
              {customPins.length > 0 && (
                <span className="tab-badge">{customPins.length}</span>
              )}
            </button>
          </div>

          <div className="sheet-content" ref={sheetContentRef}>
            {filteredBuildings.length > 0 ? (
              filteredBuildings.map((poi, index) => (
                <div
                  key={poi.id}
                  className={`poi-item ${poi.isCustom ? 'poi-custom' : ''}`}
                  onClick={() => handlePoiSelect(poi)}
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className={`poi-icon ${poi.isCustom ? 'poi-icon-custom' : ''}`}>
                    {poi.isCustom ? <Bookmark size={20} /> : <MapPin size={20} />}
                  </div>
                  <div className="poi-info">
                    <div className="poi-name">{poi.name}</div>
                    <div className="poi-desc">{poi.description}</div>
                  </div>
                  {poi.isCustom ? (
                    <button
                      className="poi-delete-btn"
                      onClick={(e) => { e.stopPropagation(); handleDeletePin(poi.id); }}
                      aria-label="Excluir local"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <div className="poi-action">
                      <ChevronUp size={16} style={{ transform: 'rotate(90deg)' }} />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="empty-state">
                {activeTab === 'saved' ? (
                  <>
                    <Bookmark size={40} strokeWidth={1.5} />
                    <p>Nenhum local salvo ainda</p>
                    <span>Segure no mapa para salvar</span>
                  </>
                ) : (
                  <>
                    <Search size={40} strokeWidth={1.5} />
                    <p>Nenhum local encontrado para "{searchTerm}"</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
