(() => {
  "use strict";

  const telemetry = window.simulatedTelemetry;
  const canvas = document.getElementById("telemetry-chart");
  const context = canvas.getContext("2d");
  const scrubber = document.getElementById("scrubber");
  const freshness = document.getElementById("monitor-freshness");
  const note = document.getElementById("monitor-note");
  const readouts = {
    speed: document.getElementById("monitor-speed"),
    distance: document.getElementById("monitor-distance"),
    battery: document.getElementById("monitor-battery"),
    age: document.getElementById("monitor-age"),
  };
  const duration = telemetry.samples.at(-1).time;
  const gap = telemetry.gap;
  const signals = {
    speedMps: { label: "Ground speed", unit: "m/s", channel: "speedMps", color: "#c6ecd3", step: 2 },
    batteryPct: { label: "Battery charge", unit: "%", channel: "batteryPct", color: "#b0cfec", step: 1 },
  };
  let signal = signals.speedMps;
  let playhead = Number(scrubber.value);
  let lastRecord = -1;
  let lastAge = -1;

  function timeLabel(time) {
    const mins = String(Math.floor(time / 60)).padStart(2, "0");
    const secs = String(Math.floor(time % 60)).padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function updateReadouts(sample) {
    const age = Math.floor(sample.packetAgeSec * 10 + 0.00001) / 10;
    if (lastRecord === sample.time && lastAge === age) return;
    lastRecord = sample.time;
    lastAge = age;

    readouts.speed.textContent = `${sample.speedMps.toFixed(1)} m/s`;
    readouts.distance.textContent = `${Math.round(sample.distanceM)} m`;
    readouts.battery.textContent = `${sample.batteryPct.toFixed(1)}%`;
    readouts.age.textContent = `${age.toFixed(1)} s`;
    freshness.dataset.stale = String(sample.stale);
    freshness.textContent = sample.stale ? "Stale packet" : "Current packet";
    note.textContent = sample.stale
      ? `Holding the ${timeLabel(sample.time)} packet during a simulated recorder gap. The pause was already recorded.`
      : `Showing packet at ${timeLabel(sample.time)} elapsed.`;
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

    const bounds = { left: width < 420 ? 39 : 48, right: width - 10, top: 10, bottom: height - 24 };
    const values = telemetry.samples.map(sample => sample[signal.channel]);
    const minimum = signal.channel === "speedMps" ? 0 : Math.floor(Math.min(...values));
    const maximum = Math.max(minimum + signal.step, Math.ceil(Math.max(...values) / signal.step) * signal.step);
    const x = time => bounds.left + (bounds.right - bounds.left) * time / duration;
    const y = value => bounds.bottom - (bounds.bottom - bounds.top) * (value - minimum) / (maximum - minimum);
    context.font = "10px ui-monospace, monospace";
    context.textBaseline = "middle";
    context.fillStyle = "#a8b4ac";
    context.textAlign = "right";
    for (const value of [minimum, (minimum + maximum) / 2, maximum]) {
      const gridY = y(value);
      context.fillText(`${Number(value.toFixed(1))}${signal.unit === "%" ? "%" : " m/s"}`, bounds.left - 6, gridY);
      context.fillStyle = "#38453e";
      context.fillRect(bounds.left, gridY, bounds.right - bounds.left, 1);
      context.fillStyle = "#a8b4ac";
    }

    context.fillStyle = "#f4c98b20";
    context.fillRect(x(gap.start), bounds.top, x(gap.end) - x(gap.start), bounds.bottom - bounds.top);
    context.strokeStyle = signal.color;
    context.lineWidth = 1.75;
    context.lineJoin = "round";
    context.beginPath();
    let previousTime = -Infinity;
    for (const sample of telemetry.samples) {
      const point = [x(sample.time), y(sample[signal.channel])];
      if (sample.time - previousTime > telemetry.samplePeriodSec) context.moveTo(...point);
      else context.lineTo(...point);
      previousTime = sample.time;
    }
    context.stroke();

    const cursorX = x(playhead);
    context.strokeStyle = "#d7e1d9";
    context.lineWidth = 1;
    context.setLineDash([3, 3]);
    context.beginPath();
    context.moveTo(cursorX, bounds.top);
    context.lineTo(cursorX, bounds.bottom);
    context.stroke();
    context.setLineDash([]);

    const active = telemetry.sampleAt(playhead);
    context.fillStyle = active.stale ? "#f4c98b" : signal.color;
    context.beginPath();
    context.arc(x(active.time), y(active[signal.channel]), 3, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#a8b4ac";
    for (const [time, align] of [[0, "left"], [duration / 2, "center"], [duration, "right"]]) {
      context.textAlign = align;
      context.fillText(timeLabel(time), x(time), height - 9);
    }
  }

  function describeChart() {
    canvas.setAttribute("aria-label", `${signal.label} across the simulated run. Recorder gap from ${timeLabel(gap.start)} to ${timeLabel(gap.end)}. Current readings appear above the chart.`);
  }

  for (const option of document.querySelectorAll('input[name="trace"]')) {
    option.addEventListener("change", () => {
      signal = signals[option.value];
      describeChart();
      draw();
    });
  }

  document.getElementById("jump-gap").addEventListener("click", () => {
    scrubber.value = gap.start + Math.floor((gap.end - gap.start) / 2);
    scrubber.dispatchEvent(new Event("input", { bubbles: true }));
  });

  window.addEventListener("replaytime", event => {
    playhead = event.detail.time;
    updateReadouts(telemetry.sampleAt(playhead));
    draw();
  });

  new ResizeObserver(draw).observe(canvas);
  describeChart();
  updateReadouts(telemetry.sampleAt(playhead));
  draw();
})();
