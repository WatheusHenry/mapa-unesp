import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { LocateFixed, Navigation, X } from 'lucide-react';

// Fix for default marker icons in Leaflet with webpack/vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Polyfill function since leaflet-routing-machine lacks proper PT language bundle exports in vite
function mapOsrmToPortuguese(englishInstruction) {
  if (!englishInstruction) return "";
  const inst = englishInstruction.toLowerCase();
  
  if (inst.includes('head')) return "Siga em frente";
  if (inst.includes('continue')) return "Continue na mesma via";
  if (inst.includes('right')) return "Vire à direita";
  if (inst.includes('left')) return "Vire à esquerda";
  if (inst.includes('arrive') || inst.includes('destination')) return "Você chegou ao destino";
  if (inst.includes('roundabout')) return "Entre na rotatória";
  if (inst.includes('turn')) return "Vire";
  
  return englishInstruction; // Fallback se não bater na Regex simples
}

const unespBauruCenter = [-22.3482, -49.0302];

// Listen for drag events to stop auto-following the user and handle map rotation
function MapEvents({ setFollowUser, mapRotation }) {
  const map = useMap();
  useEffect(() => {
    const handleDrag = () => setFollowUser(false);
    map.on('dragstart', handleDrag);
    return () => map.off('dragstart', handleDrag);
  }, [map, setFollowUser]);

  useEffect(() => {
    // Smoothly rotate map container via CSS transform using leaflet DOM
    if (map.getContainer()) {
      map.getContainer().style.transform = `rotate(${360 - mapRotation}deg)`;
      map.getContainer().style.transition = 'transform 1.2s ease-out';
    }
  }, [map, mapRotation]);

  return null;
}

function LocationMarker({ userPos, followUser }) {
  const map = useMap();
  useEffect(() => {
    if (userPos && followUser) {
      map.flyTo(userPos, 18, {
        animate: true,
        duration: 0.8
      });
    }
  }, [userPos, map, followUser]);

  return userPos === null ? null : (
    <Marker position={userPos}>
      <Popup>
        <div className="popup-title">Você está aqui!</div>
      </Popup>
    </Marker>
  );
}

function FlyToPoi({ targetPos }) {
  const map = useMap();
  useEffect(() => {
    if (targetPos && !map.routingControlActived) {
      map.flyTo(targetPos, 17, {
        animate: true,
        duration: 1.5
      });
    }
  }, [targetPos, map]);
  return null;
}

function RoutingMachine({ originPos, targetPos, onRouteFound }) {
  const map = useMap();
  
  useEffect(() => {
    if (!originPos || !targetPos) return;

    map.routingControlActived = true;

    const routingControl = L.Routing.control({
      waypoints: [
        L.latLng(originPos[0], originPos[1]),
        L.latLng(targetPos[0], targetPos[1])
      ],
      lineOptions: {
        styles: [{ color: '#3b82f6', weight: 8, opacity: 0.9 }] // Google Maps drive blue
      },
      show: false,
      addWaypoints: false,
      routeWhileDragging: false,
      fitSelectedRoutes: true,
      showAlternatives: false,
      createMarker: () => null, // Hide internal markers as we draw our own
      router: L.Routing.osrmv1({
          serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1',
          language: 'en'
      })
    }).addTo(map);

    routingControl.on('routesfound', function(e) {
      if (onRouteFound) onRouteFound(e.routes[0]);
    });

    routingControl.on('routingerror', function(err) {
      console.warn("Routing error details:", err);
      // Fallback for pt to default if language module missing
      if (err.error && err.error.status === -3) {
         console.warn("Language pack not found. The app will route the path but text instructions might be generic / EN.");
      }
    });

    return () => {
      try {
        if (map && routingControl) {
          // Setting waypoints to empty array cancels any pending routing requests
          // preventing the "Cannot read properties of null (reading 'removeLayer')" async crash
          routingControl.setWaypoints([]);
          map.removeControl(routingControl);
        }
      } catch (e) {
        console.warn("Leaflet routing unmount skipped:", e);
      }
      map.routingControlActived = false;
    };
  }, [map, originPos[0], originPos[1], targetPos[0], targetPos[1], onRouteFound]); // We use specific primitive coords to avoid object ref identity issues making continuous calls

  return null;
}

const MapComponent = ({ pois, selectedPoi }) => {
  const [userPos, setUserPos] = useState(null);
  const [locating, setLocating] = useState(false);
  const [routingTarget, setRoutingTarget] = useState(null);
  const [simulationMode, setSimulationMode] = useState(true);
  const [mapRotation, setMapRotation] = useState(0);
  
  // States array for Google Maps like navigation
  const [initialRouteOrigin, setInitialRouteOrigin] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(null);
  const [simProgress, setSimProgress] = useState(0);
  const [nextInstruction, setNextInstruction] = useState(null);
  const [followUser, setFollowUser] = useState(true);

  // GPS logic
  const requestLocation = (callback) => {
    setLocating(true);
    
    if (simulationMode) {
      setTimeout(() => {
        // Mock coordinates: near the main entrance of UNESP Bauru
        const mockLat = -22.3501;
        const mockLng = -49.0335;
        setUserPos([mockLat, mockLng]);
        setLocating(false);
        if (callback) callback([mockLat, mockLng]);
      }, 800);
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserPos([latitude, longitude]);
          setLocating(false);
          if (callback) callback([latitude, longitude]);
        },
        (error) => {
          console.error("Error obtaining location:", error);
          alert("Ative seu GPS para podermos iniciar o guia.");
          setLocating(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      alert("Geolocalização não suportada.");
      setLocating(false);
    }
  };

  const handleLocateUser = () => {
    setFollowUser(true);
    requestLocation();
  };

  const handleRouting = (lat, lng) => {
    setFollowUser(true);
    // Calc from current stable userPos or trigger request to fix first
    requestLocation((pos) => {
      setInitialRouteOrigin(pos);
      setRoutingTarget([lat, lng]);
    });
  };

  const clearRouting = () => {
    setRoutingTarget(null);
    setInitialRouteOrigin(null);
    setCurrentRoute(null);
    setSimProgress(0);
    setNextInstruction(null);
    setMapRotation(0);
  };

  const handleRouteFound = React.useCallback((route) => {
    setCurrentRoute(route);
    setSimProgress(0);
    if (route.instructions && route.instructions.length > 0) {
      setNextInstruction(route.instructions[0]);
    }
  }, []);

  // Simulate movement if simulation mode is active and we have a target
  useEffect(() => {
    if (simulationMode && currentRoute && routingTarget) {
      const coords = currentRoute.coordinates;
      if (simProgress < coords.length) {
        const timer = setTimeout(() => {
          setUserPos([coords[simProgress].lat, coords[simProgress].lng]);
          
          // Find the active instruction for this coordinate index
          const instructions = currentRoute.instructions;
          if (instructions) {
            // Traverse backwards to find the most recent instruction that we passed
            let currentInst = instructions[0];
            for (let i = instructions.length - 1; i >= 0; i--) {
              if (simProgress >= instructions[i].index) {
                currentInst = instructions[i];
                break;
              }
            }
            setNextInstruction(currentInst);
          }

          // Calculate rotation (bearing) for the map based on movement direction
          let bearing = 0;
          if (simProgress > 0) {
            const prev = coords[simProgress - 1];
            const curr = coords[simProgress];
            
            const lat1 = prev.lat * Math.PI / 180;
            const lon1 = prev.lng * Math.PI / 180;
            const lat2 = curr.lat * Math.PI / 180;
            const lon2 = curr.lng * Math.PI / 180;
            
            const dLon = lon2 - lon1;
            
            const y = Math.sin(dLon) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
            
            bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
            setMapRotation(bearing);
          }

          setSimProgress(p => p + 1);
        }, 1200); // Walk/drive speed representation
        return () => clearTimeout(timer);
      }
    }
  }, [simulationMode, currentRoute, simProgress, routingTarget]);

  return (
    <div className="map-container relative">
      <MapContainer
        center={unespBauruCenter}
        zoom={16}
        scrollWheelZoom={true}
        zoomControl={false} // Disable default zoom to manually place it or keep it clean
        className="leaflet-container"
      >
        <MapEvents setFollowUser={setFollowUser} mapRotation={mapRotation} />
        
        <TileLayer
          attribution='&copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        
        {pois.map((poi) => (
          <Marker key={poi.id} position={poi.coords}>
            <Popup>
              <div className="popup-title">{poi.name}</div>
              <div className="popup-desc">{poi.description}</div>
              <button 
                className="popup-btn"
                onClick={() => handleRouting(poi.coords[0], poi.coords[1])}
              >
                <Navigation size={18} fill="currentColor" />
                Iniciar Rota
              </button>
            </Popup>
          </Marker>
        ))}

        <LocationMarker userPos={userPos} followUser={followUser} />
        {selectedPoi && !routingTarget && <FlyToPoi targetPos={selectedPoi.coords} />}
        
        {routingTarget && initialRouteOrigin && (
          <RoutingMachine 
            originPos={initialRouteOrigin} 
            targetPos={routingTarget} 
            onRouteFound={handleRouteFound}
          />
        )}
      </MapContainer>

      {/* Dev toggle map GPS mode */}
      <div className="simulation-toggle-container">
        <label className="simulation-toggle-label">
          <input 
            type="checkbox" 
            checked={simulationMode}
            onChange={(e) => {
              setSimulationMode(e.target.checked);
              if (!e.target.checked) setUserPos(null); // Clear pos if disabling
            }}
          />
          Simular Caminho nas Ruas
        </label>
      </div>

      {/* Locate User Button */}
      <button 
        onClick={handleLocateUser}
        className={`locate-btn ${locating ? 'locating' : ''} ${routingTarget ? 'routing-active' : ''}`}
        aria-label="Minha Localização"
      >
        <LocateFixed size={24} color={followUser ? '#0065a3' : '#666'} />
      </button>

      {/* Google Maps Style Top Navigation Banner */}
      {routingTarget && (
        <div className="nav-banner">
          <div className="nav-banner-content">
            <div className="nav-icon-container">
              <Navigation size={32} color="white" fill="white" />
            </div>
            <div className="nav-text-container">
              <h2 className="nav-primary-text">
                {nextInstruction ? mapOsrmToPortuguese(nextInstruction.text) : "Calculando rota..."}
              </h2>
              {nextInstruction && nextInstruction.distance > 0 && (
                <span className="nav-secondary-text">Em {Math.round(nextInstruction.distance)} metros</span>
              )}
            </div>
            <button 
              onClick={clearRouting}
              className="nav-close-btn"
              title="Sair"
            >
              <X size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(MapComponent);
