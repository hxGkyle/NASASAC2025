const RHO0 = 1.225;
const H = 8500;
const H_TOP = 80000;
const CD = 1.0;

const K1 = 0.05;
const K2 = 0.1;
const K3 = 0.2;

const KT_TO_J = 4.184e12;
const J_TO_TON_TNT = 4.184e9;

const RISK_THRESHOLDS = {
  LOW: 1e2,
  HIGH: 1e4
};

const MIN_VELOCITY_KMS = 11;
const MAX_VELOCITY_KMS = 72;
const MIN_ELEVATION_DEG = 5;
const MAX_ELEVATION_DEG = 90;
const MIN_DIAMETER_M = 0.05;
const MIN_MASS_KG = 1;

export const DEFAULT_DENSITY = 3300;

export function computeMass(state, diameterHint = Number(state?.d_m)) {
  const directMass = sanitizeMass(Number(state?.m_kg));
  if (Number.isFinite(directMass)) {
    return directMass;
  }

  const diameter = sanitizeDiameter(diameterHint);
  if (Number.isFinite(diameter)) {
    const massFromSize = massFromDiameter(diameter, DEFAULT_DENSITY);
    if (massFromSize > 0) {
      return Math.max(massFromSize, MIN_MASS_KG);
    }
  }

  const energyKt = Number(state?.impact_energy_kt);
  const velocityKms = sanitizeVelocity(Number(state?.v_kms));
  if (Number.isFinite(energyKt) && energyKt > 0 && Number.isFinite(velocityKms)) {
    const velocityMs = velocityKms * 1000;
    const energyJ = energyKt * KT_TO_J;
    const derivedMass = massFromEnergy(energyJ, velocityMs);
    if (derivedMass > 0) {
      return Math.max(derivedMass, MIN_MASS_KG);
    }
  }

  return MIN_MASS_KG;
}

export function computeEnergyJoules(massKg, velocityKms) {
  const sanitizedMass = sanitizeMass(massKg);
  const sanitizedVelocity = sanitizeVelocity(velocityKms);
  if (!Number.isFinite(sanitizedMass) || sanitizedMass <= 0) {
    return 0;
  }
  if (!Number.isFinite(sanitizedVelocity) || sanitizedVelocity <= 0) {
    return 0;
  }
  const velocityMs = sanitizedVelocity * 1000;
  return 0.5 * sanitizedMass * Math.pow(velocityMs, 2);
}

export function deriveBodyFromEnergy({ impactEnergyKt, velocityKms, density = DEFAULT_DENSITY }) {
  const energyKt = Number(impactEnergyKt);
  const velocity = sanitizeVelocity(Number(velocityKms));
  if (!Number.isFinite(energyKt) || energyKt <= 0) {
    return null;
  }
  if (!Number.isFinite(velocity) || velocity <= 0) {
    return null;
  }
  const velocityMs = velocity * 1000;
  const energyJ = energyKt * KT_TO_J;
  const massKg = massFromEnergy(energyJ, velocityMs);
  if (!Number.isFinite(massKg) || massKg <= 0) {
    return null;
  }
  const densityValue = Number.isFinite(density) && density > 0 ? density : DEFAULT_DENSITY;
  const diameterM = diameterFromMass(massKg, densityValue);
  return {
    massKg: Math.max(massKg, MIN_MASS_KG),
    diameterM,
    density: densityValue,
    energyJ
  };
}

export function computeImpact(state) {
  const velocityKms = sanitizeVelocity(Number(state?.v_kms));
  const elevationDeg = sanitizeElevation(Number(state?.elevation_angle));
  const diameterInput = sanitizeDiameter(Number(state?.d_m));

  const massKg = computeMass(state, diameterInput);
  const diameterM = resolveDiameterMassCoupling(state, massKg, diameterInput);
  const radiusM = diameterM > 0 ? diameterM / 2 : 0;
  const area = radiusM > 0 ? Math.PI * Math.pow(radiusM, 2) : 0;

  const phiRad = toRadians(elevationDeg);
  const energyEntry = computeEnergyJoules(massKg, velocityKms);
  const angleFactor = computeAngleFactor({ massKg, area, phiRad });
  const energyGround = energyEntry * angleFactor;
  const energyLoss = Math.max(0, energyEntry - energyGround);
  const energyLossPct = energyEntry > 0 ? (energyLoss / energyEntry) * 100 : 0;
  const tntTon = energyGround / J_TO_TON_TNT;

  const eOneThird = Math.cbrt(Math.max(energyGround, 0));
  const radii = {
    severe: K1 * eOneThird,
    moderate: K2 * eOneThird,
    light: K3 * eOneThird
  };

  const riskLevel = classifyRisk(tntTon);
  const density = computeDensity(massKg, diameterM);

  return {
    massKg,
    diameterM,
    energyEntry,
    energyGround,
    tntTon,
    angleFactor,
    radii,
    riskLevel,
    density,
    energyLoss,
    energyLossPct,
    elevationDeg,
    velocityKms
  };
}

export function formatImpactSummary({
  energyGround,
  tntTon,
  radii,
  riskLevel,
  angleFactor,
  density,
  energyLoss,
  energyLossPct
}) {
  return {
    E_J: energyGround,
    TNT_ton: tntTon,
    R_severe: radii.severe,
    R_moderate: radii.moderate,
    R_light: radii.light,
    RiskLevel: riskLevel,
    AngleFactor: angleFactor,
    rho_body: density,
    EnergyLoss_J: energyLoss,
    EnergyLoss_pct: energyLossPct
  };
}

function computeAngleFactor({ massKg, area, phiRad }) {
  if (!Number.isFinite(massKg) || massKg <= 0) {
    return 0;
  }
  const sinPhi = Math.sin(phiRad);
  if (!Number.isFinite(sinPhi) || sinPhi <= 0) {
    return 0;
  }
  const k = (CD * area * RHO0 * H) / massKg;
  const fraction = Math.exp(-k / sinPhi);
  if (!Number.isFinite(fraction)) {
    return 0;
  }
  return Math.max(0, Math.min(fraction, 1));
}

function classifyRisk(tntTon) {
  if (tntTon < RISK_THRESHOLDS.LOW) {
    return "Low";
  }
  if (tntTon < RISK_THRESHOLDS.HIGH) {
    return "Medium";
  }
  return "High";
}

function sanitizeVelocity(value) {
  if (!Number.isFinite(value)) {
    return MIN_VELOCITY_KMS;
  }
  return clamp(value, MIN_VELOCITY_KMS, MAX_VELOCITY_KMS);
}

function sanitizeElevation(value) {
  if (!Number.isFinite(value)) {
    return MIN_ELEVATION_DEG;
  }
  return clamp(value, MIN_ELEVATION_DEG, MAX_ELEVATION_DEG);
}

function sanitizeDiameter(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return Number.NaN;
  }
  return Math.max(value, MIN_DIAMETER_M);
}

function sanitizeMass(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return Number.NaN;
  }
  return Math.max(value, MIN_MASS_KG);
}

function resolveDiameterMassCoupling(state, massKg, diameterInput) {
  if (Number.isFinite(diameterInput)) {
    return diameterInput;
  }
  const derived = diameterFromMass(massKg, DEFAULT_DENSITY);
  if (derived > 0) {
    return Math.max(derived, MIN_DIAMETER_M);
  }
  const fallback = sanitizeDiameter(Number(state?.d_m));
  if (Number.isFinite(fallback)) {
    return fallback;
  }
  return MIN_DIAMETER_M;
}

function massFromEnergy(energyJoules, velocityMs) {
  if (!Number.isFinite(energyJoules) || energyJoules <= 0) {
    return 0;
  }
  if (!Number.isFinite(velocityMs) || velocityMs <= 0) {
    return 0;
  }
  return (2 * energyJoules) / Math.pow(velocityMs, 2);
}

function massFromDiameter(diameter, density) {
  if (!Number.isFinite(density) || density <= 0) {
    return 0;
  }
  const sanitizedDiameter = sanitizeDiameter(diameter);
  if (!Number.isFinite(sanitizedDiameter)) {
    return 0;
  }
  const radius = sanitizedDiameter / 2;
  const volume = (4 / 3) * Math.PI * Math.pow(radius, 3);
  return volume * density;
}

function diameterFromMass(massKg, density) {
  if (!Number.isFinite(massKg) || massKg <= 0) {
    return 0;
  }
  if (!Number.isFinite(density) || density <= 0) {
    return 0;
  }
  const volume = massKg / density;
  const radius = Math.cbrt((3 * volume) / (4 * Math.PI));
  return Math.max(radius * 2, MIN_DIAMETER_M);
}

function computeDensity(massKg, diameter) {
  const sanitizedMass = sanitizeMass(massKg);
  const sanitizedDiameter = sanitizeDiameter(diameter);
  if (!Number.isFinite(sanitizedMass)) {
    return DEFAULT_DENSITY;
  }
  if (!Number.isFinite(sanitizedDiameter)) {
    return DEFAULT_DENSITY;
  }
  const radius = sanitizedDiameter / 2;
  const volume = (4 / 3) * Math.PI * Math.pow(radius, 3);
  if (volume <= 0) {
    return DEFAULT_DENSITY;
  }
  return sanitizedMass / volume;
}

function clamp(value, min, max) {
  let result = value;
  if (Number.isFinite(min)) {
    result = Math.max(result, min);
  }
  if (Number.isFinite(max)) {
    result = Math.min(result, max);
  }
  return result;
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}
