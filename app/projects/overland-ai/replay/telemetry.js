(() => {
  "use strict";

  const fixture = JSON.parse(document.getElementById("run-fixture").textContent);
  const profile = [
    { fraction: 0, speedMps: 0 },
    { fraction: 0.12, speedMps: 3.3 },
    { fraction: 0.29, speedMps: 3.7 },
    { fraction: 0.39, speedMps: 2.1 },
    { fraction: 0.49, speedMps: 3.5 },
    { fraction: 0.62, speedMps: 3.9 },
    { fraction: 0.81, speedMps: 3.2 },
    { fraction: 0.96, speedMps: 1.45 },
    { fraction: 1, speedMps: 0 },
  ].map(({ fraction, speedMps }) => ({ time: fixture.interruption * fraction, speedMps }));

  // This recorder gap follows the scripted pause. It does not affect the source event log.
  const samplePeriodSec = fixture.telemetry?.samplePeriodSec ?? 1;
  const gap = Object.freeze({
    start: fixture.telemetry?.gap?.start ?? fixture.interruption + 2,
    end: fixture.telemetry?.gap?.end ?? fixture.interruption + 6,
  });
  const samples = [];
  const latestSampleIndex = [];
  let distanceM = 0;
  let previousSpeed = 0;

  function speedAt(time) {
    if (time >= fixture.interruption) return 0;
    const endIndex = profile.findIndex((point) => point.time > time);
    const start = profile[endIndex - 1];
    const end = profile[endIndex];
    const progress = (time - start.time) / (end.time - start.time);
    return start.speedMps + (end.speedMps - start.speedMps) * progress;
  }

  const finalTick = Math.floor(fixture.duration / samplePeriodSec);
  for (let tick = 0; tick <= finalTick; tick += 1) {
    const time = tick * samplePeriodSec;
    const speedMps = speedAt(time);
    if (tick > 0) distanceM += (previousSpeed + speedMps) * samplePeriodSec / 2;
    previousSpeed = speedMps;

    const batteryPct = 91.8 - time * 0.003 - distanceM * 0.0025;
    if (time < gap.start || time >= gap.end) {
      samples.push(Object.freeze({
        time,
        speedMps,
        distanceM,
        batteryPct,
        packetAgeSec: 0,
        positionQuality: "Nominal",
        state: time >= fixture.interruption ? "Paused" : "Driving",
      }));
    }
    latestSampleIndex[tick] = samples.length - 1;
  }

  function sampleAt(seconds) {
    const at = Number.isFinite(seconds) ? Math.min(fixture.duration, Math.max(0, seconds)) : 0;
    const sample = samples[latestSampleIndex[Math.floor(at / samplePeriodSec)]];
    const packetAgeSec = at - sample.time;
    const stale = packetAgeSec >= samplePeriodSec;
    return {
      ...sample,
      at,
      packetAgeSec,
      stale,
      positionQuality: stale ? "Stale" : sample.positionQuality,
    };
  }

  window.simulatedTelemetry = Object.freeze({
    sampleAt,
    samples: Object.freeze(samples),
    gap,
    samplePeriodSec,
  });
})();
