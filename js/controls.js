import { state, defaults } from "./state.js";

const INPUT_FIELDS = [
  { id: "lat", label: "Latitude", type: "number", step: "0.0001", min: -90, max: 90 },
  { id: "lon", label: "Longitude", type: "number", step: "0.0001", min: -180, max: 180 },
  { id: "azimuth", label: "Azimuth (deg): North=0, clockwise", type: "number", min: 0, max: 360 },
  { id: "elevation_angle", label: "Elevation (deg): Horizon=0, impact=90", type: "number", min: 5, max: 90 },
  { id: "v_kms", label: "Velocity km/s", type: "number", step: "0.1", min: 11, max: 72 },
  { id: "m_kg", label: "Mass kg", type: "number", step: "1", min: 1 },
  { id: "d_m", label: "Diameter m", type: "number", step: "0.05", min: 0.05, max: 10 },
  { id: "Cd", label: "Drag Coefficient", type: "number", step: "0.1", min: 0.3, max: 2.2 }
];

const OUTPUT_FIELDS = [
  { id: "E_J", label: "Ground Energy", unit: "J" },
  { id: "TNT_ton", label: "Yield", unit: "ton TNT" },
  { id: "R_severe", label: "Severe Radius", unit: "m" },
  { id: "R_moderate", label: "Moderate Radius", unit: "m" },
  { id: "R_light", label: "Light Radius", unit: "m" },
  { id: "RiskLevel", label: "Risk Level" },
  { id: "AngleFactor", label: "Angle factor f(phi) (energy fraction)" },
  { id: "rho_body", label: "Density", unit: "kg/m3" },
  { id: "EnergyLoss_J", label: "Energy Loss", unit: "J" },
  { id: "EnergyLoss_pct", label: "Energy Loss", unit: "%" }
];

export class Controls {
  constructor({ containerId, onLoadSample, onRunModel, onReset }) {
    this.container = document.getElementById(containerId);
    this.onLoadSample = onLoadSample;
    this.onRunModel = onRunModel;
    this.onReset = onReset;
    this.inputs = {};
    this.outputs = {};
    this.render();
    this.bindEvents();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="controls">
        <div class="inputs">
          <h2>Input Parameters</h2>
          ${INPUT_FIELDS.map((field) => this.createInputField(field)).join("")}
        </div>
        <div class="actions">
          <button type="button" data-action="load">Load NASA Sample</button>
          <button type="button" data-action="simulate">Simulate Impact</button>
          <button type="button" data-action="reset">Reset</button>
        </div>
        <div class="outputs">
          <h2>Impact Outputs</h2>
          ${OUTPUT_FIELDS.map((field) => this.createOutputField(field)).join("")}
        </div>
        <div class="source-note" id="source-note"></div>
      </div>
    `;

    INPUT_FIELDS.forEach((field) => {
      this.inputs[field.id] = this.container.querySelector(`#input-${field.id}`);
    });
    OUTPUT_FIELDS.forEach((field) => {
      this.outputs[field.id] = this.container.querySelector(`#output-${field.id}`);
    });
  }

  createInputField(field) {
    const defaultValue = defaults[field.id] ?? 0;
    const attrs = [
      `id="input-${field.id}"`,
      `name="${field.id}"`,
      `type="${field.type}"`,
      `value="${defaultValue}"`
    ];
    if (field.step) attrs.push(`step="${field.step}"`);
    if (field.min !== undefined) attrs.push(`min="${field.min}"`);
    if (field.max !== undefined) attrs.push(`max="${field.max}"`);
    if (field.id === "Cd") attrs.push("disabled");

    return `
      <label class="control">
        <span>${field.label}</span>
        <input ${attrs.join(" ")} />
      </label>
    `;
  }

  createOutputField(field) {
    const unit = field.unit ? `<span class="unit">${field.unit}</span>` : "";
    return `
      <div class="control output">
        <span>${field.label}</span>
        <span id="output-${field.id}" class="value">-</span>
        ${unit}
      </div>
    `;
  }

  bindEvents() {
    INPUT_FIELDS.forEach((field) => {
      const input = this.inputs[field.id];
      if (!input) return;
      if (field.id === "Cd") return;
      input.addEventListener("input", (event) => {
        const value = parseFloat(event.target.value);
        state.update({ [field.id]: Number.isFinite(value) ? value : defaults[field.id] });
      });
    });

    this.container.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const action = target.dataset.action;
      if (action === "load" && this.onLoadSample) {
        target.disabled = true;
        target.textContent = "Loading...";
        this.onLoadSample()
          .catch((err) => {
            console.error(err);
            alert("Failed to load NASA sample. Check console for details.");
          })
          .finally(() => {
            target.disabled = false;
            target.textContent = "Load NASA Sample";
          });
      }
      if (action === "simulate" && this.onRunModel) {
        this.onRunModel();
      }
      if (action === "reset" && this.onReset) {
        this.onReset();
      }
    });

    state.subscribe((snapshot) => {
      this.updateInputs(snapshot);
      this.updateOutputs(snapshot);
      this.updateSource(snapshot.sourceMeta);
    });
  }

  updateInputs(snapshot) {
    INPUT_FIELDS.forEach((field) => {
      const input = this.inputs[field.id];
      if (!input) return;
      if (field.id === "Cd") {
        input.value = defaults[field.id];
        return;
      }
      if (document.activeElement === input) return;
      const value = snapshot[field.id];
      if (Number.isFinite(value)) {
        input.value = value;
      }
    });
  }

  updateOutputs(snapshot) {
    OUTPUT_FIELDS.forEach((field) => {
      const node = this.outputs[field.id];
      if (!node) return;
      const rawValue = snapshot[field.id];
      let text = "-";
      if (Number.isFinite(rawValue)) {
        if (field.id === "E_J" || field.id === "EnergyLoss_J") {
          text = formatScientific(rawValue, 3);
        } else if (field.id === "TNT_ton") {
          text = formatNumber(rawValue, 2);
        } else if (field.id.startsWith("R_")) {
          text = formatNumber(rawValue, 1);
        } else if (field.id === "AngleFactor") {
          text = formatNumber(rawValue, 3);
        } else if (field.id === "rho_body") {
          text = formatNumber(rawValue, 0);
        } else if (field.id === "EnergyLoss_pct") {
          text = formatNumber(rawValue, 1);
        } else {
          text = String(rawValue);
        }
      } else if (typeof rawValue === "string") {
        text = rawValue;
      }
      node.textContent = text;
    });
  }

  updateSource(meta) {
    const note = this.container.querySelector("#source-note");
    if (!note) return;
    if (!meta) {
      note.textContent = "";
      return;
    }
    const parts = [];
    if (meta.source === "api") parts.push("NASA API sample");
    if (meta.source === "sample") parts.push("Offline sample");
    if (meta.date) parts.push(`Event: ${meta.date}`);
    if (Number.isFinite(meta.vel_kms)) parts.push(`Velocity ${formatNumber(meta.vel_kms, 2)} km/s`);
    if (Number.isFinite(meta.impact_energy_kt)) parts.push(`Impact Energy ${formatNumber(meta.impact_energy_kt, 2)} kt`);
    note.textContent = parts.join(" | ");
  }
}

function formatNumber(value, decimals) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1e6) {
    return value.toExponential(decimals);
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  });
}

function formatScientific(value, significantDigits = 3) {
  if (!Number.isFinite(value)) return "-";
  const digits = Math.max(0, significantDigits - 1);
  return value.toExponential(digits);
}

