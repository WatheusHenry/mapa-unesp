import React, { useState, useEffect } from 'react';
import './App.css';
import MapComponent from './MapComponent';
import { Search, MapPin, Map as MapIcon, ChevronUp, ChevronDown, Check } from 'lucide-react';

const unespBuildings = [
  { id: '1', name: 'Biblioteca (Bauru)', description: 'Biblioteca Central do Campus UNESP Bauru.', coords: [-22.348633, -49.030614] },
  { id: '2', name: 'Restaurante Universitário (RU)', description: 'Refeitório para alunos e funcionários.', coords: [-22.3458, -49.0287] },
  { id: '3', name: 'Faculdade de Ciências (FC)', description: 'Laboratórios, salas de aula e administrativo da FC.', coords: [-22.3475, -49.0261] },
  { id: '4', name: 'FAAC', description: 'Faculdade de Arquitetura, Artes, Comunicação e Design.', coords: [-22.3462, -49.0315] },
  { id: '5', name: 'FEB', description: 'Faculdade de Engenharia de Bauru.', coords: [-22.3510, -49.0325] },
  { id: '6', name: 'Portaria Principal', description: 'Entrada principal do campus.', coords: [-22.350056, -49.033639] },
];

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPoi, setSelectedPoi] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [welcomeOpen, setWelcomeOpen] = useState(true);

  const filteredBuildings = unespBuildings.filter(poi => 
    poi.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    poi.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePoiSelect = (poi) => {
    setSelectedPoi(poi);
    setSheetOpen(false); // Mobile friendly: hide sheet after selecting
  };

  useEffect(() => {
    // Basic interaction tracking to dismiss welcome screen
    const tmr = setTimeout(() => {
     // auto dismiss welcome screen if needed, but manual is better for UX
    }, 5000);
    return () => clearTimeout(tmr);
  }, []);

  return (
    <div className="app-container">
      {welcomeOpen && (
        <div className="welcome-overlay">
          <MapIcon size={80} className="welcome-icon" />
          <h1 className="welcome-title">Bem-vindo ao Guia UNESP</h1>
          <p className="welcome-desc">
            Encontre facilmente prédios, auditórios e laboratórios dentro do campus Bauru.
          </p>
          <button className="welcome-btn" onClick={() => setWelcomeOpen(false)}>
            <Check size={24} /> Começar a Explorar
          </button>
        </div>
      )}



      {/* Search Bar */}
      <div className="search-container">
        <Search className="search-icon" size={20} />
        <input 
          type="text" 
          placeholder="Buscar locais no campus..." 
          className="search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setSheetOpen(true)}
        />
      </div>

      {/* Map Module */}
      <MapComponent pois={unespBuildings} selectedPoi={selectedPoi} />

      {/* Bottom Sheet for Points of Interest List */}
      <div className={`bottom-sheet ${sheetOpen ? 'open' : ''}`}>
        <div className="sheet-header" onClick={() => setSheetOpen(!sheetOpen)}>
          <div style={{width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            <div className="drag-handle"></div>
            <div className="sheet-title">
              Explorar Locais 
              {sheetOpen ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            </div>
          </div>
        </div>
        
        <div className="sheet-content">
          {filteredBuildings.length > 0 ? (
            filteredBuildings.map(poi => (
              <div 
                key={poi.id} 
                className="poi-item"
                onClick={() => handlePoiSelect(poi)}
              >
                <div className="poi-icon">
                  <MapPin size={24} />
                </div>
                <div className="poi-info">
                  <div className="poi-name">{poi.name}</div>
                  <div className="poi-desc">{poi.description}</div>
                </div>
              </div>
            ))
          ) : (
            <div style={{textAlign: 'center', padding: '20px', color: 'var(--text-light)'}}>
              Nenhum local encontrado para "{searchTerm}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
