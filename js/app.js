import { state } from "./state.js";
import { loadRandomEvent } from "./datasource.js";
import { computeImpact, formatImpactSummary, deriveBodyFromEnergy } from "./model.js";
import { MapView } from "./mapview.js";
import { DirectionIndicator } from "./direction-indicator.js";
import { Controls } from "./controls.js";

const mapView = new MapView({ mapId: "map" });
const directionIndicator = new DirectionIndicator(document.getElementById("direction-indicator"));
const controls = new Controls({
  containerId: "controls-container",
  onLoadSample: handleLoadSample,
  onRunModel: () => {
    const snapshot = state.snapshot;
    const motionOptions = buildMotionOptions(snapshot);
    recomputeImpact(snapshot);
    requestAnimationFrame(() => mapView.triggerPulse({ ...state.snapshot }, motionOptions));
  },
  onReset: () => state.reset()
});

let isApplyingComputed = false;

state.subscribe((snapshot) => {
  if (!isApplyingComputed) {
    recomputeImpact(snapshot);
  }
  mapView.update(snapshot);
  directionIndicator.update({
    azimuthDeg: snapshot.azimuth,
    elevationDeg: snapshot.elevation_angle,
    riskLevel: snapshot.RiskLevel
  });
});

async function handleLoadSample() {
  const event = await loadRandomEvent();
  const patch = {};
  if (Number.isFinite(event.vel_kms)) patch.v_kms = event.vel_kms;
  if (Number.isFinite(event.lat)) patch.lat = event.lat;
  if (Number.isFinite(event.lon)) patch.lon = event.lon;

  if (Number.isFinite(event.impact_energy_kt)) {
    patch.impact_energy_kt = event.impact_energy_kt;
    const currentVelocity = Number.isFinite(patch.v_kms) ? patch.v_kms : state.snapshot.v_kms;
    if (Number.isFinite(currentVelocity)) {
      const derived = deriveBodyFromEnergy({
        impactEnergyKt: event.impact_energy_kt,
        velocityKms: currentVelocity
      });
      if (derived) {
        patch.m_kg = derived.massKg;
        patch.d_m = derived.diameterM;
      }
    }
  }

  state.update({
    ...patch,
    sourceMeta: event
  });

  const snapshot = state.snapshot;
  const motionOptions = buildMotionOptions(snapshot);
  requestAnimationFrame(() => {
    mapView.triggerPulse({ ...snapshot }, motionOptions);
  });
}

function recomputeImpact(snapshot) {
  isApplyingComputed = true;
  try {
    const result = computeImpact(snapshot);
    const summary = formatImpactSummary(result);
    state.update(summary);
    return summary;
  } finally {
    isApplyingComputed = false;
  }
}

function buildMotionOptions(snapshot) {
  const speedKms = Number(snapshot.v_kms);
  if (!Number.isFinite(speedKms) || speedKms <= 0) {
    return null;
  }
  const elevationDeg = Number(snapshot.elevation_angle);
  const elevationRad = toRadians(Number.isFinite(elevationDeg) ? elevationDeg : 0);
  const horizontalSpeed = Math.max(0, speedKms * Math.cos(elevationRad));
  if (!Number.isFinite(horizontalSpeed) || horizontalSpeed <= 0) {
    return null;
  }
  return { horizontalSpeedKmPerSec: horizontalSpeed };
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

window.addEventListener("DOMContentLoaded", () => {
  state.emit();
});
