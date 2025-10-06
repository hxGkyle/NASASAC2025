const FIREBALL_API = "https://ssd-api.jpl.nasa.gov/fireball.api";
const SAMPLE_URL = new URL("../data/sample.json", import.meta.url).href;

const SHOULD_USE_REMOTE_API = (() => {
  if (typeof window === "undefined") {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("useApi") === "1") return true;
  if (params.get("useApi") === "0") return false;
  const host = window.location.hostname || "";
  return !host.endsWith("github.io");
})();

function parseNumber(value) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function parseSigned(value, direction) {
  const magnitude = parseNumber(value);
  if (!Number.isFinite(magnitude)) {
    return undefined;
  }
  const dir = typeof direction === "string" ? direction.trim().toUpperCase() : "";
  if (dir === "S" || dir === "W") {
    return -magnitude;
  }
  return magnitude;
}

async function fetchFireballFromApi() {
  const limit = 200;
  const params = new URLSearchParams({
    sort: "-energy",
    limit: String(limit)
  });
  const response = await fetch(`${FIREBALL_API}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Fireball API error: ${response.status}`);
  }
  const data = await response.json();
  if (!data || !Array.isArray(data.data) || data.data.length === 0) {
    throw new Error("Fireball API returned no data");
  }
  const randomRow = pickRandom(data.data);
  return normalizeApiRow(randomRow);
}

function normalizeApiRow(row) {
  const [date, energyKt, impactEnergyKt, lat, latDir, lon, lonDir, altKm, velKms] = row;
  const impactKt = parseNumber(impactEnergyKt) ?? parseNumber(energyKt);
  return {
    vel_kms: parseNumber(velKms),
    alt_km: parseNumber(altKm),
    date,
    lat: parseSigned(lat, latDir),
    lon: parseSigned(lon, lonDir),
    impact_energy_kt: impactKt,
    energy_kt: parseNumber(energyKt),
    source: "api"
  };
}

async function fetchFallbackSample() {
  const response = await fetch(SAMPLE_URL);
  if (!response.ok) {
    throw new Error("Failed to load sample data");
  }
  const payload = await response.json();

  if (Array.isArray(payload) && payload.length > 0) {
    const sample = pickRandom(payload);
    return { ...sample, source: "sample" };
  }

  if (payload && Array.isArray(payload.data) && payload.data.length > 0) {
    const fields = Array.isArray(payload.fields) ? payload.fields : [];
    const fieldIndex = buildFieldIndex(fields);
    const row = pickRandom(payload.data);
    return normalizeSampleRow(row, fieldIndex);
  }

  throw new Error("Sample data format not supported");
}

function buildFieldIndex(fields) {
  const map = new Map();
  fields.forEach((name, idx) => {
    map.set(String(name).toLowerCase(), idx);
  });
  return map;
}

function normalizeSampleRow(row, fieldIndex) {
  if (Array.isArray(row)) {
    const get = (name) => {
      const idx = fieldIndex.get(name);
      return idx !== undefined ? row[idx] : undefined;
    };
    const impactKt = parseNumber(get("impact-e")) ?? parseNumber(get("impact_energy_kt")) ?? parseNumber(get("energy"));
    return {
      vel_kms: parseNumber(get("vel")),
      alt_km: parseNumber(get("alt")),
      date: get("date"),
      lat: parseSigned(get("lat"), get("lat-dir")),
      lon: parseSigned(get("lon"), get("lon-dir")),
      impact_energy_kt: impactKt,
      energy_kt: parseNumber(get("energy")),
      source: "sample"
    };
  }

  if (row && typeof row === "object") {
    const impactKt = parseNumber(row["impact-e"]) ?? parseNumber(row.impact_energy_kt) ?? parseNumber(row.energy);
    return {
      vel_kms: parseNumber(row.vel || row.velocity || row.vel_kms),
      alt_km: parseNumber(row.alt || row.alt_km),
      date: row.date,
      lat: parseSigned(row.lat, row["lat-dir"] || row.lat_dir),
      lon: parseSigned(row.lon, row["lon-dir"] || row.lon_dir),
      impact_energy_kt: impactKt,
      energy_kt: parseNumber(row.energy),
      source: "sample"
    };
  }

  throw new Error("Unsupported sample row format");
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export async function loadRandomEvent() {
  if (!SHOULD_USE_REMOTE_API) {
    return fetchFallbackSample();
  }
  try {
    return await fetchFireballFromApi();
  } catch (err) {
    console.warn("Fireball API failed, loading fallback sample", err);
    return fetchFallbackSample();
  }
}
