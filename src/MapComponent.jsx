import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-rotate';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { LocateFixed, Navigation, X, Plus } from 'lucide-react';

// Fix for default marker icons in Leaflet with webpack/vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ---------- Custom Icons ----------

// User icon when NOT navigating — blue dot with rotatable direction arrow
function createUserIcon(heading = 0) {
  return L.divIcon({
    className: 'user-location-icon',
    html: `
      <div class="user-marker-wrapper">
        <div class="user-pulse-ring"></div>
        <div class="user-dot">
          <div class="user-arrow" style="transform: rotate(${heading}deg)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L4 20L12 16L20 20L12 2Z"/>
            </svg>
          </div>
        </div>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -24],
  });
}

// User icon during NAVIGATION — blue chevron (no CSS rotation, map rotates instead)
const navIcon = L.divIcon({
  className: 'user-location-icon',
  html: `
    <div class="nav-user-wrapper">
      <div class="nav-user-glow"></div>
      <div class="nav-user-chevron">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 3L4 17h16L12 3z" fill="#1a73e8" stroke="white" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
  `,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
  popupAnchor: [0, -24],
});

// POI place marker (styled pin with building icon)
const poiIcon = L.divIcon({
  className: 'poi-marker-icon',
  html: `
    <div class="poi-pin">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 21V7L9 4L15 7L21 4V18L15 21L9 18L3 21Z" fill="white" opacity="0.9"/>
        <path d="M9 4V18M15 7V21" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
      </svg>
    </div>
    <div class="poi-pin-tail"></div>
  `,
  iconSize: [36, 44],
  iconAnchor: [18, 44],
  popupAnchor: [0, -44],
});

// Destination marker (red flag)
const destinationIcon = L.divIcon({
  className: 'destination-marker-icon',
  html: `
    <div class="destination-pin">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 21V4M4 15H14L12 10L14 5H4" fill="white" opacity="0.9" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="destination-pin-tail"></div>
  `,
  iconSize: [36, 44],
  iconAnchor: [18, 44],
  popupAnchor: [0, -44],
});

// Custom saved pin (green bookmark)
const customPinIcon = L.divIcon({
  className: 'custom-marker-icon',
  html: `
    <div class="custom-pin">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="white" opacity="0.9" stroke="white" stroke-width="1"/>
      </svg>
    </div>
    <div class="custom-pin-tail"></div>
  `,
  iconSize: [36, 44],
  iconAnchor: [18, 44],
  popupAnchor: [0, -44],
});

// Polyfill function since leaflet-routing-machine lacks proper PT language bundle exports in vite
function mapOsrmToPortuguese(englishInstruction) {
  if (!englishInstruction) return "";
  const inst = englishInstruction.toLowerCase();

  if (inst.includes('arrive') || inst.includes('destination')) return "Você chegou ao destino";
  if (inst.includes('sharp right')) return "Vire acentuadamente à direita";
  if (inst.includes('sharp left')) return "Vire acentuadamente à esquerda";
  if (inst.includes('slight right')) return "Mantenha-se à direita";
  if (inst.includes('slight left')) return "Mantenha-se à esquerda";
  if (inst.includes('right')) return "Vire à direita";
  if (inst.includes('left')) return "Vire à esquerda";
  if (inst.includes('head') && inst.includes('north')) return "Siga para o norte";
  if (inst.includes('head') && inst.includes('south')) return "Siga para o sul";
  if (inst.includes('head') && inst.includes('east')) return "Siga para o leste";
  if (inst.includes('head') && inst.includes('west')) return "Siga para o oeste";
  if (inst.includes('head')) return "Siga em frente";
  if (inst.includes('continue')) return "Continue em frente";
  if (inst.includes('roundabout')) return "Entre na rotatória";
  if (inst.includes('u-turn')) return "Faça retorno";
  if (inst.includes('keep right')) return "Mantenha-se à direita";
  if (inst.includes('keep left')) return "Mantenha-se à esquerda";
  if (inst.includes('merge')) return "Entre na via";
  if (inst.includes('turn')) return "Vire";

  return englishInstruction;
}

// Format distance for large instruction display
function formatDistanceLarge(meters) {
  if (!meters || meters <= 0) return '';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  if (meters >= 100) return `${Math.round(meters / 10) * 10} m`;
  return `${Math.round(meters)} m`;
}

// ---------- Bearing calculation ----------
function calcBearing(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => deg * Math.PI / 180;
  const toDeg = (rad) => rad * 180 / Math.PI;

  const dLon = toRad(lng2 - lng1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Smooth angle interpolation
function lerpAngle(from, to, t) {
  let diff = ((to - from + 540) % 360) - 180;
  return from + diff * t;
}

const unespBauruCenter = [-22.3482, -49.0302];

// Listen for drag events & lock map during navigation
function MapEvents({ setFollowUser, isNavigating }) {
  const map = useMap();
  useEffect(() => {
    const handleDrag = () => setFollowUser(false);
    map.on('dragstart', handleDrag);
    return () => map.off('dragstart', handleDrag);
  }, [map, setFollowUser]);

  // Disable dragging during navigation
  useEffect(() => {
    if (isNavigating) {
      map.dragging.disable();
      map.touchZoom.disable();
    } else {
      map.dragging.enable();
      map.touchZoom.enable();
    }
  }, [map, isNavigating]);

  return null;
}

// Auto-close all popups when navigation starts
function ClosePopupsOnNav({ isNavigating }) {
  const map = useMap();
  useEffect(() => {
    if (isNavigating) {
      map.closePopup();
    }
  }, [map, isNavigating]);
  return null;
}

// Exposes the current map center to the parent via a ref
function MapCenterProvider({ mapCenterRef }) {
  const map = useMap();

  useEffect(() => {
    const updateCenter = () => {
      const c = map.getCenter();
      mapCenterRef.current = { lat: c.lat, lng: c.lng };
    };
    updateCenter();
    map.on('moveend', updateCenter);
    map.on('zoomend', updateCenter);
    return () => {
      map.off('moveend', updateCenter);
      map.off('zoomend', updateCenter);
    };
  }, [map, mapCenterRef]);

  return null;
}

// Smooth map rotation controller using leaflet-rotate's native setBearing()
// Interpolates bearing at 60fps for Waze-like fluidity
function MapRotationController({ targetBearing, isNavigating }) {
  const map = useMap();
  const currentBearingRef = useRef(0);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);

  useEffect(() => {
    if (!isNavigating) {
      // Smoothly reset bearing to 0 when navigation ends
      const resetBearing = () => {
        const current = currentBearingRef.current;
        if (Math.abs(current) < 0.5) {
          currentBearingRef.current = 0;
          map.setBearing(0);
          return;
        }
        const newBearing = lerpAngle(current, 0, 0.12);
        currentBearingRef.current = newBearing;
        map.setBearing(-newBearing);
        rafRef.current = requestAnimationFrame(resetBearing);
      };
      rafRef.current = requestAnimationFrame(resetBearing);
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }

    // During navigation: smoothly interpolate to target bearing at 60fps
    const animate = (time) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05); // cap at 50ms
      lastTimeRef.current = time;

      const current = currentBearingRef.current;
      // Smooth factor: higher = faster response. 5-8 gives Waze-like feel.
      const smoothFactor = 6;
      const newBearing = lerpAngle(current, targetBearing, 1 - Math.exp(-smoothFactor * dt));

      currentBearingRef.current = newBearing;
      map.setBearing(-newBearing); // negative: map rotates opposite to heading so heading faces up

      rafRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = null;
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = null;
    };
  }, [map, targetBearing, isNavigating]);

  return null;
}

function LocationMarker({ userPos, followUser, heading, isNavigating }) {
  const map = useMap();
  const userIconRef = useRef(createUserIcon(0));
  const lastHeadingRef = useRef(0);

  useEffect(() => {
    if (userPos && followUser) {
      if (isNavigating) {
        // Offset user to lower 30% of screen so they can see the route ahead
        const containerHeight = map.getContainer().clientHeight;
        const offsetY = containerHeight * 0.2; // shift map up by 20% of screen
        const userPoint = map.latLngToContainerPoint(userPos);
        const targetPoint = L.point(userPoint.x, userPoint.y - offsetY);
        const targetLatLng = map.containerPointToLatLng(targetPoint);
        map.setView(targetLatLng, map.getZoom(), { animate: false });
      } else {
        map.panTo(userPos, { animate: true, duration: 0.35, easeLinearity: 0.5 });
      }
    }
  }, [userPos, map, followUser, isNavigating]);

  // Update user icon arrow when NOT navigating (during nav, the map rotates instead)
  useEffect(() => {
    if (isNavigating) return; // no icon rotation during navigation
    const diff = Math.abs(heading - lastHeadingRef.current);
    if (diff > 2 || diff === 0) {
      userIconRef.current = createUserIcon(heading);
      lastHeadingRef.current = heading;
    }
  }, [heading, isNavigating]);

  // During navigation: use the static navIcon (map rotates, not the icon)
  const icon = isNavigating ? navIcon : userIconRef.current;

  return userPos === null ? null : (
    <Marker position={userPos} icon={icon} zIndexOffset={1000}>
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
      map.flyTo(targetPos, 19, {
        animate: true,
        duration: 1.5
      });
    }
  }, [targetPos, map]);
  return null;
}

// Routing Machine — uses a ref to ensure only ONE routing control is ever active.
// This prevents StrictMode double-mount and rapid re-render issues from creating 
// multiple concurrent API requests.
function RoutingMachine({ originPos, targetPos, onRouteFound }) {
  const map = useMap();
  const routingRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!originPos || !targetPos) return;

    // Prevent StrictMode double-mount from creating duplicate controls
    if (mountedRef.current && routingRef.current) return;
    mountedRef.current = true;

    map.routingControlActived = true;

    const routingControl = L.Routing.control({
      waypoints: [
        L.latLng(originPos[0], originPos[1]),
        L.latLng(targetPos[0], targetPos[1])
      ],
      lineOptions: {
        styles: [
          { color: '#1a73e8', weight: 7, opacity: 0.85 },
          { color: '#4285f4', weight: 4, opacity: 0.6 }
        ]
      },
      show: false,
      addWaypoints: false,
      routeWhileDragging: false,
      fitSelectedRoutes: true,
      showAlternatives: false,
      createMarker: () => null,
      router: L.Routing.osrmv1({
        serviceUrl: 'https://routing.openstreetmap.de/routed-car/route/v1',
        language: 'en'
      })
    }).addTo(map);

    routingRef.current = routingControl;

    routingControl.on('routesfound', function (e) {
      if (onRouteFound) onRouteFound(e.routes[0]);
    });

    routingControl.on('routingerror', function (err) {
      console.warn("Routing error details:", err);
    });

    return () => {
      try {
        if (map && routingRef.current) {
          routingRef.current.setWaypoints([]);
          map.removeControl(routingRef.current);
        }
      } catch (e) {
        console.warn("Leaflet routing unmount skipped:", e);
      }
      routingRef.current = null;
      mountedRef.current = false;
      map.routingControlActived = false;
    };
    // Only re-create when the actual coordinates change — NOT when onRouteFound changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, originPos[0], originPos[1], targetPos[0], targetPos[1]]);

  return null;
}

// ---------- Instruction icon selector ---------- 
function getNavIconSvg(instruction) {
  if (!instruction) return null;
  const text = instruction.text?.toLowerCase() || '';

  // U-turn
  if (text.includes('u-turn')) {
    return (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 14L4 9l5-5" />
        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      </svg>
    );
  }
  // Right turns
  if (text.includes('right')) {
    return (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    );
  }
  // Left turns
  if (text.includes('left')) {
    return (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    );
  }
  // Arrive / destination
  if (text.includes('arrive') || text.includes('destination')) {
    return (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="white" strokeWidth="2" />
        <circle cx="12" cy="10" r="3" fill="white" />
      </svg>
    );
  }
  // Default: straight ahead arrow
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

const MapComponent = ({ pois, selectedPoi, onAddPin, onDeletePin, onNavigatingChange }) => {
  const [userPos, setUserPos] = useState(null);
  const [locating, setLocating] = useState(false);
  const mapCenterRef = useRef({ lat: -22.3482, lng: -49.0302 });
  const [routingTarget, setRoutingTarget] = useState(null);
  const [simulationMode, setSimulationMode] = useState(true);
  const [heading, setHeading] = useState(0);

  // Smooth simulation refs
  const simAnimRef = useRef(null);
  const simStartTimeRef = useRef(null);

  // States for Google Maps like navigation
  const [initialRouteOrigin, setInitialRouteOrigin] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(null);
  const [simProgress, setSimProgress] = useState(0);
  const [nextInstruction, setNextInstruction] = useState(null);
  const [followUser, setFollowUser] = useState(true);
  const [bearing, setBearing] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [destinationName, setDestinationName] = useState('');

  // ETA display
  const [routeDistance, setRouteDistance] = useState(null);
  const [routeTime, setRouteTime] = useState(null);

  // GPS logic
  const requestLocation = useCallback((callback) => {
    setLocating(true);

    if (simulationMode) {
      setTimeout(() => {
        const mockLat = -22.3490;
        const mockLng = -49.0310;
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
  }, [simulationMode]);

  const handleLocateUser = () => {
    setFollowUser(true);
    requestLocation();
  };

  const handleRouting = (lat, lng) => {
    setFollowUser(true);
    setArrived(false);
    // Find destination name from POIs
    const destPoi = pois.find(p => p.coords[0] === lat && p.coords[1] === lng);
    setDestinationName(destPoi ? destPoi.name : 'Destino');
    requestLocation((pos) => {
      setInitialRouteOrigin(pos);
      setRoutingTarget([lat, lng]);
    });
  };

  const clearRouting = () => {
    if (simAnimRef.current) { cancelAnimationFrame(simAnimRef.current); simAnimRef.current = null; }
    setRoutingTarget(null);
    setInitialRouteOrigin(null);
    setCurrentRoute(null);
    setSimProgress(0);
    setNextInstruction(null);
    setBearing(0);
    setHeading(0);
    setArrived(false);
    setRouteDistance(null);
    setRouteTime(null);
    setDestinationName('');
  };

  // Stable callback for route found — does NOT go into RoutingMachine deps
  const handleRouteFound = useCallback((route) => {
    setCurrentRoute(route);
    setSimProgress(0);
    setArrived(false);
    if (route.summary) {
      setRouteDistance(route.summary.totalDistance);
      setRouteTime(route.summary.totalTime);
    }
    if (route.instructions && route.instructions.length > 0) {
      setNextInstruction(route.instructions[0]);
    }
  }, []);

  // ===== Smooth 60fps simulation along the route =====
  // Instead of jumping between coordinates, we interpolate smoothly.
  useEffect(() => {
    if (!simulationMode || !currentRoute || !routingTarget) return;

    const coords = currentRoute.coordinates;
    if (!coords || coords.length < 2) return;

    // Calculate cumulative distances for each coordinate
    const distances = [0];
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const dx = (curr.lat - prev.lat);
      const dy = (curr.lng - prev.lng);
      distances.push(distances[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    const totalDist = distances[distances.length - 1];

    // Walking speed: traverse each unit of distance in ~X seconds
    // Adjust this to control simulation speed
    const SPEED = totalDist / 30; // Complete route in ~30 seconds
    let progress = 0; // 0 to totalDist
    let lastTime = performance.now();
    let lastInstructionIdx = -1;

    const animate = (time) => {
      const dt = (time - lastTime) / 1000; // seconds
      lastTime = time;

      progress += SPEED * dt;

      if (progress >= totalDist) {
        // Arrived
        const last = coords[coords.length - 1];
        setUserPos([last.lat, last.lng]);
        setArrived(true);
        setRouteDistance(0);
        setRouteTime(0);
        simAnimRef.current = null;
        return;
      }

      // Find which segment we're on
      let segIdx = 0;
      for (let i = 1; i < distances.length; i++) {
        if (distances[i] >= progress) { segIdx = i - 1; break; }
      }

      // Interpolate position within this segment
      const segStart = distances[segIdx];
      const segEnd = distances[segIdx + 1];
      const segLen = segEnd - segStart;
      const t = segLen > 0 ? (progress - segStart) / segLen : 0;

      const fromCoord = coords[segIdx];
      const toCoord = coords[segIdx + 1];
      const interpLat = fromCoord.lat + (toCoord.lat - fromCoord.lat) * t;
      const interpLng = fromCoord.lng + (toCoord.lng - fromCoord.lng) * t;

      setUserPos([interpLat, interpLng]);
      setSimProgress(segIdx);

      // Smooth bearing from current to look-ahead
      const lookAhead = Math.min(segIdx + 5, coords.length - 1);
      const newBearing = calcBearing(interpLat, interpLng, coords[lookAhead].lat, coords[lookAhead].lng);
      setBearing(newBearing);
      setHeading(newBearing);

      // Update instructions (only when segment changes)
      const instructions = currentRoute.instructions;
      if (instructions) {
        let instIdx = 0;
        for (let i = instructions.length - 1; i >= 0; i--) {
          if (segIdx >= instructions[i].index) { instIdx = i; break; }
        }
        if (instIdx !== lastInstructionIdx) {
          lastInstructionIdx = instIdx;
          setNextInstruction(instructions[instIdx]);
        }
      }

      // Update remaining distance/time
      if (currentRoute.summary) {
        const ratio = progress / totalDist;
        setRouteDistance(currentRoute.summary.totalDistance * (1 - ratio));
        setRouteTime(currentRoute.summary.totalTime * (1 - ratio));
      }

      simAnimRef.current = requestAnimationFrame(animate);
    };

    simAnimRef.current = requestAnimationFrame(animate);

    return () => {
      if (simAnimRef.current) {
        cancelAnimationFrame(simAnimRef.current);
        simAnimRef.current = null;
      }
    };
  }, [simulationMode, currentRoute, routingTarget]); // Note: removed simProgress from deps

  const formatDistance = (meters) => {
    if (!meters) return '';
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
  };

  const formatTime = (seconds) => {
    if (!seconds) return '';
    const mins = Math.round(seconds / 60);
    if (mins < 1) return 'Menos de 1 min';
    if (mins === 1) return '1 min';
    return `${mins} min`;
  };

  const isNavigating = !!routingTarget && !!currentRoute;

  // Notify parent about navigation state changes
  useEffect(() => {
    if (onNavigatingChange) onNavigatingChange(isNavigating);
  }, [isNavigating, onNavigatingChange]);

  return (
    <div className="map-container relative">
      <MapContainer
        center={unespBauruCenter}
        zoom={19}
        scrollWheelZoom={true}
        zoomControl={false}
        className="leaflet-container"
        rotate={true}
        bearing={0}
        touchRotate={false}
        shiftKeyRotate={false}
      >
        <MapEvents setFollowUser={setFollowUser} isNavigating={isNavigating} />
        <MapCenterProvider mapCenterRef={mapCenterRef} />
        <MapRotationController targetBearing={bearing} isNavigating={isNavigating} />
        <ClosePopupsOnNav isNavigating={isNavigating} />

        <TileLayer
          attribution='&copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {/* POI Markers */}
        {pois.map((poi) => {
          const isDestination = routingTarget &&
            poi.coords[0] === routingTarget[0] &&
            poi.coords[1] === routingTarget[1];

          let icon = poiIcon;
          if (isDestination) icon = destinationIcon;
          else if (poi.isCustom) icon = customPinIcon;

          return (
            <Marker
              key={poi.id}
              position={poi.coords}
              icon={icon}
            >
              <Popup>
                <div className="popup-title">{poi.name}</div>
                <div className="popup-desc">{poi.description}</div>
                <div className="popup-actions">
                  <button
                    className="popup-btn"
                    onClick={() => handleRouting(poi.coords[0], poi.coords[1])}
                  >
                    <Navigation size={16} fill="currentColor" />
                    Rota
                  </button>
                  {poi.isCustom && onDeletePin && (
                    <button
                      className="popup-btn popup-btn-delete"
                      onClick={() => onDeletePin(poi.id)}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        <LocationMarker
          userPos={userPos}
          followUser={followUser}
          heading={isNavigating ? heading : 0}
          isNavigating={isNavigating}
        />
        {selectedPoi && !routingTarget && <FlyToPoi targetPos={selectedPoi.coords} />}

        {routingTarget && initialRouteOrigin && (
          <RoutingMachine
            originPos={initialRouteOrigin}
            targetPos={routingTarget}
            onRouteFound={handleRouteFound}
          />
        )}
      </MapContainer>

      {/* Dev toggle — hide during navigation */}
      {!isNavigating && (
        <div className="simulation-toggle-container">
          <label className="simulation-toggle-label">
            <input
              type="checkbox"
              checked={simulationMode}
              onChange={(e) => {
                setSimulationMode(e.target.checked);
                if (!e.target.checked) setUserPos(null);
              }}
            />
            Simular Caminho
          </label>
        </div>
      )}

      {/* Map action buttons — hide add-pin when navigating */}
      <div className="map-action-buttons">
        {onAddPin && !isNavigating && (
          <button
            onClick={() => {
              const c = mapCenterRef.current;
              onAddPin(c.lat, c.lng);
            }}
            className="add-pin-btn"
            aria-label="Salvar local"
          >
            <Plus size={24} color="#2e7d32" />
          </button>
        )}
        {!isNavigating && (
          <button
            onClick={handleLocateUser}
            className={`locate-btn ${locating ? 'locating' : ''}`}
            aria-label="Minha Localização"
          >
            <LocateFixed size={24} color={followUser ? '#1a73e8' : '#666'} />
          </button>
        )}
      </div>

      {/* Crosshair center indicator — hide during navigation */}
      {!isNavigating && (
        <div className="map-crosshair">
          <div className="crosshair-dot" />
        </div>
      )}

      {/* ========== NAVIGATION HUD ========== */}
      {routingTarget && (
        <>
          {/* TOP BANNER — Next instruction (only while navigating, hidden on arrival) */}
          {!arrived && (
            <div className="nav-banner">
              <div className="nav-instruction-row">
                <div className="nav-icon-container">
                  {getNavIconSvg(nextInstruction)}
                </div>
                <div className="nav-instruction-info">
                  {nextInstruction && nextInstruction.distance > 0 && (
                    <span className="nav-instruction-distance">
                      {formatDistanceLarge(nextInstruction.distance)}
                    </span>
                  )}
                  <h2 className="nav-primary-text">
                    {nextInstruction
                      ? mapOsrmToPortuguese(nextInstruction.text)
                      : "Calculando rota..."
                    }
                  </h2>
                </div>
              </div>
            </div>
          )}

          {/* BOTTOM BAR — Route summary during nav, arrival card when arrived */}
          {arrived ? (
            <div className="nav-bottom-bar nav-bottom-arrived">
              <div className="nav-arrived-bottom-content">
                <div className="nav-arrived-check">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="#0f9d58" />
                    <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="nav-arrived-bottom-text">
                  <span className="nav-arrived-title">Você chegou!</span>
                  <span className="nav-arrived-dest">{destinationName}</span>
                </div>
              </div>
              <button onClick={clearRouting} className="nav-bottom-done" title="Concluir">
                Concluir
              </button>
            </div>
          ) : (
            <div className="nav-bottom-bar">
              <div className="nav-bottom-info">
                <div className="nav-bottom-eta">
                  <span className="nav-bottom-eta-value">{formatTime(routeTime)}</span>
                  <span className="nav-bottom-eta-label">tempo restante</span>
                </div>
                <div className="nav-bottom-divider" />
                <div className="nav-bottom-distance">
                  <span className="nav-bottom-distance-value">{formatDistance(routeDistance)}</span>
                  <span className="nav-bottom-distance-label">distância</span>
                </div>
                <div className="nav-bottom-divider" />
                <div className="nav-bottom-dest">
                  <span className="nav-bottom-dest-icon">📍</span>
                  <span className="nav-bottom-dest-name">{destinationName}</span>
                </div>
              </div>
              <button onClick={clearRouting} className="nav-bottom-cancel" title="Encerrar navegação">
                <X size={18} />
                <span>Sair</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default React.memo(MapComponent);
