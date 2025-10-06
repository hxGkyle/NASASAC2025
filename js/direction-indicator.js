const DEFAULT_AZIMUTH = 45;
const DEFAULT_ELEVATION = 35;
const ANGLE_SNAP_EPSILON = 0.05;
const ROTATION_DURATION_MS = 240;

export class DirectionIndicator {
  constructor(el, { onRendered } = {}) {
    this.root = typeof el === "string" ? document.getElementById(el) : el;
    if (!this.root) {
      throw new Error("DirectionIndicator: container element not found");
    }

    this.planCanvas = this.root.querySelector("canvas[data-view='plan']");
    this.profileCanvas = this.root.querySelector("canvas[data-view='profile']");
    this.planCtx = this.planCanvas?.getContext("2d") ?? null;
    this.profileCtx = this.profileCanvas?.getContext("2d") ?? null;
    this.riskLabel = this.root.querySelector("[data-role='risk-label']");
    this.onRendered = typeof onRendered === "function" ? onRendered : null;

    this.current = {
      azimuth: DEFAULT_AZIMUTH,
      elevation: DEFAULT_ELEVATION
    };
    this.target = { ...this.current };
    this.riskLevel = "Low";

    this.pixelRatio = window.devicePixelRatio || 1;
    this.animationFrame = null;
    this.animation = null;

    this.resizeObserver = null;
    this.handleResize = this.handleResize.bind(this);
    this.renderFrame = this.renderFrame.bind(this);

    this.setupCanvas(this.planCanvas);
    this.setupCanvas(this.profileCanvas);
    this.attachResizeObserver();
    this.updateAccessibleText();
    this.renderStatic();
  }

  update({ azimuthDeg, elevationDeg, riskLevel }) {
    if (!this.planCtx || !this.profileCtx) return;

    let needsFrame = false;

    if (Number.isFinite(azimuthDeg)) {
      const normalized = normalizeAngle(azimuthDeg);
      if (Math.abs(shortestAngleDifference(this.target.azimuth, normalized)) > ANGLE_SNAP_EPSILON) {
        this.target.azimuth = normalized;
        needsFrame = true;
      }
    }

    if (Number.isFinite(elevationDeg)) {
      const clamped = clamp(elevationDeg, 5, 90);
      if (Math.abs(this.target.elevation - clamped) > ANGLE_SNAP_EPSILON) {
        this.target.elevation = clamped;
        needsFrame = true;
      }
    }

    if (riskLevel && riskLevel !== this.riskLevel) {
      this.riskLevel = riskLevel;
      if (this.riskLabel) {
        this.riskLabel.textContent = `Risk: ${riskLevel}`;
      }
    }

    if (needsFrame) {
      this.beginAnimation();
      this.updateAccessibleText();
      if (!this.animationFrame) {
        this.animationFrame = requestAnimationFrame(this.renderFrame);
      }
    }
  }

  beginAnimation() {
    this.animation = {
      startAzimuth: this.current.azimuth,
      startElevation: this.current.elevation,
      targetAzimuth: normalizeAngle(this.target.azimuth),
      targetElevation: this.target.elevation,
      startTime: null
    };
  }

  dispose() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.animation = null;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  renderStatic() {
    if (!this.planCtx || !this.profileCtx) return;
    this.drawPlan(this.current.azimuth);
    this.drawProfile(this.current.elevation);
  }

  renderFrame(timestamp) {
    if (!this.planCtx || !this.profileCtx) {
      this.animationFrame = null;
      return;
    }

    if (!this.animation) {
      this.drawPlan(this.current.azimuth);
      this.drawProfile(this.current.elevation);
      this.animationFrame = null;
      return;
    }

    if (this.animation.startTime === null) {
      this.animation.startTime = timestamp;
      this.animation.startAzimuth = this.current.azimuth;
      this.animation.startElevation = this.current.elevation;
    }

    const elapsed = timestamp - this.animation.startTime;
    const progress = Math.min(Math.max(elapsed / ROTATION_DURATION_MS, 0), 1);
    const eased = easeOutCubic(progress);

    this.current.azimuth = interpolateAngle(this.animation.startAzimuth, this.animation.targetAzimuth, eased);
    this.current.elevation = lerp(this.animation.startElevation, this.animation.targetElevation, eased);

    this.drawPlan(this.current.azimuth);
    this.drawProfile(this.current.elevation);

    if (typeof this.onRendered === "function") {
      this.onRendered({ ...this.current });
    }

    if (progress < 1) {
      this.animationFrame = requestAnimationFrame(this.renderFrame);
    } else {
      const finalAzimuth = normalizeAngle(this.animation.targetAzimuth);
      const finalElevation = this.animation.targetElevation;
      this.current.azimuth = finalAzimuth;
      this.current.elevation = finalElevation;
      this.animation = null;
      this.animationFrame = null;
    }
  }

  setupCanvas(canvas) {
    if (!canvas) return;
    const { width, height } = canvas.getBoundingClientRect();
    const ratio = this.pixelRatio;
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
    }
  }

  attachResizeObserver() {
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    if (this.planCanvas) this.resizeObserver.observe(this.planCanvas);
    if (this.profileCanvas) this.resizeObserver.observe(this.profileCanvas);
  }

  handleResize() {
    this.pixelRatio = window.devicePixelRatio || 1;
    this.setupCanvas(this.planCanvas);
    this.setupCanvas(this.profileCanvas);
    this.renderStatic();
  }

  drawPlan(azimuth) {
    const canvas = this.planCanvas;
    const ctx = this.planCtx;
    if (!canvas || !ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 14;

    const bgGradient = ctx.createRadialGradient(centerX, centerY, radius * 0.1, centerX, centerY, radius * 1.15);
    bgGradient.addColorStop(0, "#092040");
    bgGradient.addColorStop(1, "#030914");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    const ringGradient = ctx.createRadialGradient(centerX, centerY, radius * 0.2, centerX, centerY, radius);
    ringGradient.addColorStop(0, "rgba(120, 200, 255, 0.25)");
    ringGradient.addColorStop(1, "rgba(40, 100, 180, 0.85)");

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(92, 201, 255, 0.55)";
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = ringGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.72, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(140, 190, 255, 0.35)";
    for (let angle = 0; angle < 360; angle += 30) {
      const radians = (angle * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const inner = radius * 0.6;
      const outer = radius;
      ctx.beginPath();
      ctx.moveTo(centerX + cos * inner, centerY + sin * inner);
      ctx.lineTo(centerX + cos * outer, centerY + sin * outer);
      ctx.stroke();
    }

    ctx.fillStyle = "#d0e6ff";
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labels = [
      { text: "N", angle: 0 },
      { text: "E", angle: 90 },
      { text: "S", angle: 180 },
      { text: "W", angle: 270 }
    ];
    labels.forEach(({ text, angle }) => {
      const radians = (angle * Math.PI) / 180;
      const distance = radius - 12;
      const x = centerX + Math.sin(radians) * distance;
      const y = centerY - Math.cos(radians) * distance;
      ctx.fillText(text, x, y);
    });

    const azRad = (azimuth * Math.PI) / 180;
    const arrowLength = radius * 0.75;
    const arrowX = centerX + Math.sin(azRad) * arrowLength;
    const arrowY = centerY - Math.cos(azRad) * arrowLength;

    const shaftGradient = ctx.createLinearGradient(centerX, centerY, arrowX, arrowY);
    shaftGradient.addColorStop(0, "rgba(180, 230, 255, 0.85)");
    shaftGradient.addColorStop(1, "#5cc9ff");

    ctx.save();
    ctx.shadowColor = "rgba(8, 16, 32, 0.6)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;

    ctx.strokeStyle = shaftGradient;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(arrowX, arrowY);
    ctx.stroke();

    const headSize = 18;
    ctx.fillStyle = "#8be4ff";
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX + Math.cos(azRad) * (-headSize) - Math.sin(azRad) * (headSize * 0.6), arrowY + Math.sin(azRad) * (-headSize) + Math.cos(azRad) * (headSize * 0.6));
    ctx.lineTo(arrowX + Math.cos(azRad) * (-headSize) + Math.sin(azRad) * (headSize * 0.6), arrowY + Math.sin(azRad) * (-headSize) - Math.cos(azRad) * (headSize * 0.6));
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    ctx.restore();
  }

  drawProfile(elevation) {
    const canvas = this.profileCanvas;
    const ctx = this.profileCtx;
    if (!canvas || !ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);

    const groundY = height * 0.72;
    const originX = width * 0.18;
    const maxLength = Math.min(width * 0.65, height * 0.9);

    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "#0a1e3c");
    bgGradient.addColorStop(1, "#041022");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(130, 190, 255, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(width, groundY);
    ctx.stroke();

    ctx.fillStyle = "rgba(92, 201, 255, 0.12)";
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(width * 0.95, groundY);
    ctx.lineTo(width * 0.95, groundY - height * 0.45);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#cfe1ff";
    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [0, 30, 60, 90].forEach((tick) => {
      const ratio = tick / 90;
      const y = groundY - ratio * (height * 0.55);
      ctx.globalAlpha = tick === 0 ? 0.8 : 0.6;
      ctx.beginPath();
      ctx.moveTo(originX - 6, y);
      ctx.lineTo(originX + maxLength * 0.05, y);
      ctx.stroke();
      ctx.fillText(`${tick} deg`, originX - 10, y);
    });
    ctx.globalAlpha = 1;

    const elevRad = (elevation * Math.PI) / 180;
    const endX = originX + Math.cos(elevRad) * maxLength;
    const endY = groundY - Math.sin(elevRad) * maxLength;

    const shaftGradient = ctx.createLinearGradient(originX, groundY, endX, endY);
    shaftGradient.addColorStop(0, "rgba(200, 230, 255, 0.85)");
    shaftGradient.addColorStop(1, "#ff6f4d");

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;

    ctx.strokeStyle = shaftGradient;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(originX, groundY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.fillStyle = "#ffb599";
    ctx.beginPath();
    const headSize = 14;
    ctx.moveTo(endX, endY);
    const angleLeft = elevRad + Math.PI * 0.75;
    const angleRight = elevRad - Math.PI * 0.75;
    ctx.lineTo(endX + Math.cos(angleLeft) * headSize, endY + Math.sin(angleLeft) * headSize);
    ctx.lineTo(endX + Math.cos(angleRight) * headSize, endY + Math.sin(angleRight) * headSize);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    ctx.fillStyle = "rgba(210, 235, 255, 0.7)";
    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`Elevation ${elevation.toFixed(1)} deg`, originX + 8, groundY - 12);
  }

  updateAccessibleText() {
    if (!this.root) return;
    const title = `Azimuth ${this.target.azimuth.toFixed(1)} degrees; Elevation ${this.target.elevation.toFixed(1)} degrees.`;
    this.root.setAttribute("title", title);
  }
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function interpolateAngle(startDeg, targetDeg, t) {
  const diff = shortestAngleDifference(startDeg, targetDeg);
  return normalizeAngle(startDeg + diff * t);
}

function easeOutCubic(t) {
  const clamped = Math.min(Math.max(t, 0), 1);
  const inv = 1 - clamped;
  return 1 - inv * inv * inv;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function shortestAngleDifference(current, target) {
  return ((target - current + 540) % 360) - 180;
}
