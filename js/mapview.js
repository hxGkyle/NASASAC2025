import { state } from "./state.js";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const HILLSHADE_URL = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/tile/{z}/{y}/{x}";

export const IMPACT_ANIMATION_DURATION_MS = 900;

const STYLES = {
  severe: {
    color: "#ff3b47",
    fillColor: "#ff3b47",
    fillOpacity: 0.35
  },
  moderate: {
    color: "#ff9a36",
    fillColor: "#ff9a36",
    fillOpacity: 0.22
  },
  light: {
    color: "#ffd34f",
    fillColor: "#ffd34f",
    fillOpacity: 0.14
  },
  glow: {
    color: "#ffffff00",
    fillColor: "#8c1a33",
    fillOpacity: 0.08,
    stroke: false
  }
};

export class MapView {
  constructor({ mapId }) {
    this.map = L.map(mapId, {
      center: [20, 0],
      zoom: 2,
      worldCopyJump: true,
      zoomControl: false,
      attributionControl: false
    });
    this.circles = {
      severe: null,
      moderate: null,
      light: null,
      glow: null
    };
    this.hasFocused = false;
    this.lastLatLng = null;
    this.lastSourceSignature = null;
    this.lastZoomLevel = this.map.getZoom();
    this.isAnimatingRadii = false;
    this.pendingSnapshot = null;
    this.animationFrame = null;
    this.directionLayer = null;
    this.directionSegments = null;
    this.lastDirectionAzimuth = null;

    L.tileLayer(TILE_URL, {
      attribution: "&copy; OpenStreetMap contributors",
      opacity: 0.95
    }).addTo(this.map);

    L.tileLayer(HILLSHADE_URL, {
      opacity: 0.3,
      attribution: "USGS 3DEP"
    }).addTo(this.map);

    this.directionPaneName = "direction-vector";
    this.directionPane = this.map.createPane(this.directionPaneName);
    this.directionPane.style.zIndex = 625;
    this.directionPane.style.pointerEvents = "none";

    this.map.on("click", (event) => {
      const { lat, lng } = event.latlng;
      this.lastSourceSignature = null; // manual selection
      state.update({ lat, lon: lng });
    });

    this.map.on("zoomend", () => {
      this.lastZoomLevel = this.map.getZoom();
    });
  }

  update(snapshot) {
    const { lat, lon } = snapshot;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }
    const latlng = [lat, lon];
    this.ensureCircles();
    this.maybeFocus(snapshot, latlng);

    if (this.isAnimatingRadii) {
      this.pendingSnapshot = snapshot;
      return;
    }

    this.applyRadii(latlng, snapshot);
    this.updateDirectionArrow(latlng, snapshot.azimuth);
  }

  ensureCircles() {
    if (!this.circles.severe) {
      this.circles.severe = L.circle([0, 0], { radius: 0 });
      this.circles.severe.addTo(this.map);
    }
    if (!this.circles.moderate) {
      this.circles.moderate = L.circle([0, 0], { radius: 0 });
      this.circles.moderate.addTo(this.map);
    }
    if (!this.circles.light) {
      this.circles.light = L.circle([0, 0], { radius: 0 });
      this.circles.light.addTo(this.map);
    }
    if (!this.circles.glow) {
      this.circles.glow = L.circle([0, 0], { radius: 0, stroke: false });
      this.circles.glow.addTo(this.map);
    }
  }

  ensureDirectionArrow() {
    if (this.directionSegments) {
      return;
    }
    this.directionLayer = L.layerGroup().addTo(this.map);
    const baseOptions = {
      color: "#5cc9ff",
      weight: 3,
      opacity: 0.85,
      pane: this.directionPaneName,
      interactive: false
    };
    const headOptions = {
      color: "#5cc9ff",
      weight: 2,
      opacity: 0.85,
      pane: this.directionPaneName,
      interactive: false
    };
    this.directionSegments = {
      shaft: L.polyline([], baseOptions).addTo(this.directionLayer),
      headLeft: L.polyline([], headOptions).addTo(this.directionLayer),
      headRight: L.polyline([], headOptions).addTo(this.directionLayer)
    };
  }

  updateDirectionArrow(latlng, azimuthDeg) {
    if (!Number.isFinite(azimuthDeg)) {
      if (this.directionSegments) {
        Object.values(this.directionSegments).forEach((segment) => segment.setLatLngs([]));
      }
      this.lastDirectionAzimuth = null;
      return;
    }
    this.ensureDirectionArrow();
    const normalized = normalizeBearing(azimuthDeg);
    const baseLat = latlng[0];
    const baseLon = latlng[1];
    const lengthKm = 20;
    const tip = destinationPoint(baseLat, baseLon, normalized, lengthKm);
    const headLength = lengthKm * 0.35;
    const left = destinationPoint(tip[0], tip[1], normalized + 150, headLength);
    const right = destinationPoint(tip[0], tip[1], normalized - 150, headLength);
    this.directionSegments.shaft.setLatLngs([latlng, tip]);
    this.directionSegments.headLeft.setLatLngs([tip, left]);
    this.directionSegments.headRight.setLatLngs([tip, right]);
    this.lastDirectionAzimuth = normalized;
  }

  applyRadii(latlng, snapshot) {
    this.updateCircle(this.circles.severe, latlng, snapshot.R_severe, STYLES.severe);
    this.updateCircle(this.circles.moderate, latlng, snapshot.R_moderate, STYLES.moderate);
    this.updateCircle(this.circles.light, latlng, snapshot.R_light, STYLES.light);
    this.updateCircle(this.circles.glow, latlng, snapshot.R_light * 1.12, STYLES.glow);
  }

  updateCircle(circle, latlng, radiusMeters, style) {
    if (!circle) return;
    circle.setLatLng(latlng);
    circle.setRadius(Math.max(radiusMeters, 0));
    circle.setStyle(style);
  }

  maybeFocus(snapshot, latlng) {
    const hasLatLngChanged =
      !this.lastLatLng || this.lastLatLng[0] !== latlng[0] || this.lastLatLng[1] !== latlng[1];
    const targetZoom = resolveZoomFromRadius(snapshot.R_light);
    const shouldUseZoom = Number.isFinite(targetZoom);

    if (
      snapshot.sourceMeta &&
      Number.isFinite(snapshot.sourceMeta?.lat) &&
      Number.isFinite(snapshot.sourceMeta?.lon)
    ) {
      const signature = [
        snapshot.sourceMeta.source,
        snapshot.sourceMeta.date,
        snapshot.sourceMeta.lat?.toFixed(3),
        snapshot.sourceMeta.lon?.toFixed(3)
      ].join(":");
      const zoomChanged = shouldUseZoom && this.shouldAdjustZoom(targetZoom);
      if (signature !== this.lastSourceSignature || zoomChanged) {
        this.lastSourceSignature = signature;
        const zoom = shouldUseZoom ? targetZoom : this.map.getZoom();
        this.map.flyTo(latlng, zoom, { duration: 1.2 });
        if (shouldUseZoom) {
          this.lastZoomLevel = zoom;
        }
      }
    } else if (!this.hasFocused && hasLatLngChanged) {
      const zoom = shouldUseZoom ? targetZoom : this.map.getZoom();
      this.map.setView(latlng, zoom, { animate: true });
      this.hasFocused = true;
      if (shouldUseZoom) {
        this.lastZoomLevel = zoom;
      }
    } else {
      this.adjustZoom(latlng, targetZoom, hasLatLngChanged);
    }

    if (hasLatLngChanged) {
      this.lastLatLng = latlng;
    }
  }

  adjustZoom(latlng, targetZoom, hasLatLngChanged) {
    if (Number.isFinite(targetZoom)) {
      if (this.shouldAdjustZoom(targetZoom)) {
        this.map.flyTo(latlng, targetZoom, { duration: 0.6 });
        this.lastZoomLevel = targetZoom;
        return;
      }
    }
    if (hasLatLngChanged) {
      this.map.panTo(latlng, { animate: true });
    }
  }

  shouldAdjustZoom(targetZoom) {
    if (!Number.isFinite(targetZoom)) {
      return false;
    }
    if (!Number.isFinite(this.lastZoomLevel)) {
      return true;
    }
    return Math.abs(this.lastZoomLevel - targetZoom) >= 0.5;
  }

  triggerPulse(snapshot, motionOptions = null) {
    if (!Number.isFinite(snapshot.lat) || !Number.isFinite(snapshot.lon)) return;
    this.ensureCircles();
    const finalLatLng = [snapshot.lat, snapshot.lon];
    const motion = computeMotionState(snapshot, motionOptions);
    const initialLatLng = motion ? motion.startLatLng : finalLatLng;

    this.updateDirectionArrow(initialLatLng, snapshot.azimuth);
    this.updateCircle(this.circles.severe, initialLatLng, 0, STYLES.severe);
    this.updateCircle(this.circles.moderate, initialLatLng, 0, STYLES.moderate);
    this.updateCircle(this.circles.light, initialLatLng, 0, STYLES.light);
    this.updateCircle(this.circles.glow, initialLatLng, 0, STYLES.glow);

    const targets = {
      severe: Math.max(snapshot.R_severe, 0),
      moderate: Math.max(snapshot.R_moderate, 0),
      light: Math.max(snapshot.R_light, 0)
    };

    const start = performance.now();
    const duration = IMPACT_ANIMATION_DURATION_MS;
    this.isAnimatingRadii = true;
    this.pendingSnapshot = snapshot;

    const animate = (time) => {
      const elapsed = time - start;
      const t = Math.min(Math.max(elapsed / duration, 0), 1);
      const eased = easeOutBack(t);
      const currentLatLng = motion ? positionAlongMotion(motion, t) : finalLatLng;

      this.updateCircle(this.circles.severe, currentLatLng, targets.severe * eased, STYLES.severe);
      this.updateCircle(this.circles.moderate, currentLatLng, targets.moderate * eased, STYLES.moderate);
      this.updateCircle(this.circles.light, currentLatLng, targets.light * eased, STYLES.light);
      this.updateCircle(this.circles.glow, currentLatLng, targets.light * 1.12 * eased, STYLES.glow);
      this.updateDirectionArrow(currentLatLng, snapshot.azimuth);

      if (t < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        this.isAnimatingRadii = false;
        this.animationFrame = null;
        const finalAzimuth = Number.isFinite(snapshot.azimuth) ? snapshot.azimuth : 0;
        this.updateDirectionArrow(finalLatLng, finalAzimuth);
        if (this.pendingSnapshot) {
          this.applyRadii(finalLatLng, this.pendingSnapshot);
          this.pendingSnapshot = null;
        }
        this.lastLatLng = finalLatLng;
      }
    };

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.animationFrame = requestAnimationFrame(animate);
  }
}

function resolveZoomFromRadius(radiusMeters) {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return null;
  }
  const radiusKm = radiusMeters / 1000;
  if (radiusKm <= 0.2) return 10;
  if (radiusKm <= 0.75) return 9;
  if (radiusKm <= 3) return 8;
  if (radiusKm <= 12) return 7;
  if (radiusKm <= 60) return 6;
  if (radiusKm <= 150) return 5;
  return 4;
}

function computeMotionState(snapshot, motionOptions) {
  const lat = Number(snapshot.lat);
  const lon = Number(snapshot.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  const horizontalSpeed = resolveHorizontalSpeedKmPerSec(snapshot, motionOptions);
  if (!Number.isFinite(horizontalSpeed) || horizontalSpeed <= 0) {
    return null;
  }
  const azimuth = Number(snapshot.azimuth);
  const normalizedAzimuth = Number.isFinite(azimuth) ? normalizeBearing(azimuth) : 0;
  const travelKm = horizontalSpeed * (IMPACT_ANIMATION_DURATION_MS / 1000);
  if (!Number.isFinite(travelKm) || travelKm <= 0) {
    return null;
  }
  const startBearing = normalizeBearing(normalizedAzimuth + 180);
  const startLatLng = destinationPoint(lat, lon, startBearing, travelKm);
  return {
    startLatLng,
    endLatLng: [lat, lon],
    azimuth: normalizedAzimuth,
    travelKm
  };
}

function resolveHorizontalSpeedKmPerSec(snapshot, motionOptions) {
  if (motionOptions && Number.isFinite(motionOptions.horizontalSpeedKmPerSec)) {
    return Math.max(0, motionOptions.horizontalSpeedKmPerSec);
  }
  const speedKms = Number(snapshot.v_kms);
  if (!Number.isFinite(speedKms) || speedKms <= 0) {
    return 0;
  }
  const elevationDeg = Number(snapshot.elevation_angle);
  const elevationRad = toRadians(Number.isFinite(elevationDeg) ? elevationDeg : 0);
  const horizontal = speedKms * Math.cos(elevationRad);
  return Math.max(0, horizontal);
}

function positionAlongMotion(motion, t) {
  if (!motion) {
    return null;
  }
  const clampedT = Math.min(Math.max(t, 0), 1);
  const distanceKm = motion.travelKm * clampedT;
  return destinationPoint(motion.startLatLng[0], motion.startLatLng[1], motion.azimuth, distanceKm);
}


function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function normalizeBearing(angle) {
  return ((angle % 360) + 360) % 360;
}

function destinationPoint(latDeg, lonDeg, bearingDeg, distanceKm) {
  const earthRadiusKm = 6371;
  const angularDistance = distanceKm / earthRadiusKm;
  const bearingRad = toRadians(bearingDeg);
  const latRad = toRadians(latDeg);
  const lonRad = toRadians(lonDeg);

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinAngular = Math.sin(angularDistance);
  const cosAngular = Math.cos(angularDistance);

  const lat2 = Math.asin(sinLat * cosAngular + cosLat * sinAngular * Math.cos(bearingRad));
  const lon2 = lonRad + Math.atan2(
    Math.sin(bearingRad) * sinAngular * cosLat,
    cosAngular - sinLat * Math.sin(lat2)
  );

  return [toDegrees(lat2), wrapLongitude(toDegrees(lon2))];
}

function wrapLongitude(lon) {
  return ((lon + 540) % 360) - 180;
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}




