(() => {
  "use strict";

  const get = id => document.getElementById(id);
  const fixture = JSON.parse(get("run-fixture").textContent);
  const { samples, eventTime, domain } = fixture.fusion;
  const records = [...samples].sort((first, second) => first.time - second.time);
  const [minimum, maximum] = domain;
  const canvas = get("fusion-plot");
  const context = canvas.getContext("2d");
  const scrubber = get("scrubber");
  const gap = get("fusion-gap");
  const recordTime = get("fusion-record-time");
  const status = get("fusion-status");
  const samplePeriod = fixture.telemetry?.samplePeriodSec ?? 1;

  const lanes = [
    { key: "onboard", label: "Onboard", color: "#b0cfec" },
    { key: "gps", label: "GPS", color: "#f4c98b" },
    { key: "fused", label: "Fused", color: "#c6ecd3" },
  ].map(lane => ({
    ...lane,
    position: get(`fusion-${lane.key}`),
    uncertainty: get(`fusion-${lane.key}-uncertainty`),
  }));

  let activeSample;
  let activeState;

  function formatTime(time) {
    const minutes = String(Math.floor(time / 60)).padStart(2, "0");
    const seconds = String(Math.floor(time % 60)).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function formatMeters(value) {
    return `${value.toFixed(1)} m`;
  }

  function formatUncertainty(value) {
    return `${value.toFixed(2).replace(/0$/, "")} m`;
  }

  function drawEstimate(estimate, rowY, color, project, plotStart, plotEnd) {
    const positionX = project(estimate.positionM);
    const minimumX = Math.max(plotStart, project(estimate.positionM - estimate.sigmaM));
    const maximumX = Math.min(plotEnd, project(estimate.positionM + estimate.sigmaM));
    context.strokeStyle = color;
    context.lineWidth = 1.7;
    context.beginPath();
    context.moveTo(minimumX, rowY - 5);
    context.lineTo(minimumX, rowY + 5);
    context.moveTo(maximumX, rowY - 5);
    context.lineTo(maximumX, rowY + 5);
    context.moveTo(minimumX, rowY);
    context.lineTo(maximumX, rowY);
    context.stroke();
    context.fillStyle = color;
    context.beginPath();
    context.arc(Math.max(plotStart, Math.min(plotEnd, positionX)), rowY, 4.3, 0, Math.PI * 2);
    context.fill();
  }

  function draw() {
    if (!context) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const plotStart = width < 360 ? 66 : 80;
    const plotEnd = width - 18;
    const plotTop = 8;
    const axisY = height - 25;
    const rowHeight = (axisY - plotTop) / lanes.length;
    const range = maximum - minimum;
    const project = value => plotStart + (value - minimum) / range * (plotEnd - plotStart);

    context.font = "11px ui-monospace, monospace";
    context.textBaseline = "middle";
    context.textAlign = "center";
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = minimum + range * tick / 4;
      const horizontal = project(value);
      context.fillStyle = "#37443d";
      context.fillRect(Math.round(horizontal), plotTop, 1, axisY - plotTop);
      context.fillStyle = "#a8b4ac";
      const label = Number(value.toFixed(1));
      context.fillText(tick === 4 ? `${label} m` : String(label), horizontal, height - 10);
    }

    context.textAlign = "left";
    lanes.forEach(({ key, label, color }, index) => {
      const rowY = plotTop + (index + 0.5) * rowHeight;
      context.fillStyle = "#303c36";
      context.fillRect(plotStart, Math.round(rowY), plotEnd - plotStart, 1);
      context.fillStyle = color;
      context.fillText(label, 2, rowY);
      const estimate = activeSample?.[key];
      if (estimate) {
        context.save();
        context.globalAlpha = activeState === "held" ? 0.65 : 1;
        drawEstimate(estimate, rowY, color, project, plotStart, plotEnd);
        context.restore();
      }
    });
  }

  function render(time) {
    const sample = records.findLast(record => record.time <= time);
    const state = !sample ? "missing" : time - sample.time >= samplePeriod ? "held" : "current";
    if (sample === activeSample && state === activeState) return;
    activeSample = sample;
    activeState = state;

    const description = [];
    for (const lane of lanes) {
      const estimate = sample?.[lane.key];
      lane.position.textContent = estimate ? formatMeters(estimate.positionM) : "—";
      lane.uncertainty.textContent = estimate ? `±${formatUncertainty(estimate.sigmaM)}` : "—";
      if (estimate) {
        description.push(`${lane.label} ${formatMeters(estimate.positionM)}, plus or minus ${formatUncertainty(estimate.sigmaM)}`);
      }
    }

    const disagreement = sample?.gps && sample.onboard
      ? Math.abs(sample.gps.positionM - sample.onboard.positionM)
      : null;
    gap.textContent = disagreement === null ? "—" : formatMeters(disagreement);
    recordTime.textContent = sample ? `Sample ${formatTime(sample.time)}` : "";
    status.dataset.state = state;
    if (!sample) status.textContent = "No sample";
    else if (state === "held") status.textContent = "Held";
    else status.textContent = "Recorded";

    const summary = sample
      ? `${status.textContent} sample at ${formatTime(sample.time)}. ${description.join(". ")}.`
      : "No recorded sample.";
    canvas.setAttribute("aria-label", `Simulated position and uncertainty. Whiskers show one standard deviation. ${summary}`);
    draw();
  }

  get("jump-fusion").addEventListener("click", () => {
    scrubber.value = eventTime;
    scrubber.dispatchEvent(new Event("input", { bubbles: true }));
  });
  window.addEventListener("replaytime", event => render(event.detail.time));
  new ResizeObserver(draw).observe(canvas);
  render(Number(scrubber.value));
})();
