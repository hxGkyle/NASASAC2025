const DEFAULTS = {
  lat: 0,
  lon: 0,
  azimuth: 45,
  elevation_angle: 70,
  v_kms: 20,
  m_kg: 2000000,
  d_m: 20,
  impact_energy_kt: 0,
  Cd: 1.0
};

const OUTPUT_DEFAULTS = {
  E_J: 0,
  TNT_ton: 0,
  R_severe: 0,
  R_moderate: 0,
  R_light: 0,
  RiskLevel: "Low",
  AngleFactor: 0,
  rho_body: 0,
  EnergyLoss_J: 0,
  EnergyLoss_pct: 0
};

const INPUT_SANITIZERS = {
  v_kms: (value, current) => coerceInRange(value, 11, 72, current ?? DEFAULTS.v_kms),
  elevation_angle: (value, current) => coerceInRange(value, 5, 90, current ?? DEFAULTS.elevation_angle),
  d_m: (value, current) => coerceInRange(value, 0.05, undefined, current ?? DEFAULTS.d_m),
  m_kg: (value, current) => coerceInRange(value, 1, undefined, current ?? DEFAULTS.m_kg),
  Cd: () => DEFAULTS.Cd
};

class AppState {
  constructor() {
    this.data = {
      ...DEFAULTS,
      ...OUTPUT_DEFAULTS,
      lastUpdated: Date.now(),
      sourceMeta: null
    };
    this.listeners = new Set();
  }

  get snapshot() {
    return { ...this.data };
  }

  reset() {
    this.update({
      ...DEFAULTS,
      ...OUTPUT_DEFAULTS,
      sourceMeta: null
    });
  }

  update(patch) {
    let changed = false;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const sanitized = sanitizeValueForKey(key, value, this.data[key]);
      if (sanitized === undefined || this.data[key] === sanitized) continue;
      this.data[key] = sanitized;
      changed = true;
    }
    if (changed) {
      this.data.lastUpdated = Date.now();
      this.emit();
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.snapshot);
    return () => this.listeners.delete(fn);
  }

  emit() {
    const snapshot = this.snapshot;
    this.listeners.forEach((fn) => fn(snapshot));
  }
}

export const state = new AppState();
export const defaults = DEFAULTS;

function sanitizeValueForKey(key, value, current) {
  const handler = INPUT_SANITIZERS[key];
  if (!handler) {
    return value;
  }
  return handler(value, current);
}

function coerceInRange(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  let result = value;
  if (Number.isFinite(min)) {
    result = Math.max(result, min);
  }
  if (Number.isFinite(max)) {
    result = Math.min(result, max);
  }
  return result;
}


