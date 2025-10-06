const FIREBALL_API = "https://ssd-api.jpl.nasa.gov/fireball.api";
const SAMPLE_URL = new URL("../data/sample.json", import.meta.url).href;

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
  const randomRow = data.data[Math.floor(Math.random() * data.data.length)];
  const [date, energyKt, impactEnergyKt, lat, latDir, lon, lonDir, altKm, velKms] = randomRow;

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
  const samples = await response.json();
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("Sample data empty");
  }
  const random = samples[Math.floor(Math.random() * samples.length)];
  return { ...random, source: "sample" };
}

export async function loadRandomEvent() {
  try {
    const event = await fetchFireballFromApi();
    return event;
  } catch (err) {
    console.warn("Fireball API failed, loading fallback sample", err);
    const fallback = await fetchFallbackSample();
    return fallback;
  }
}

