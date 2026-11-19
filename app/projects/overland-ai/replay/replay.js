(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const fixture = JSON.parse(byId("run-fixture").textContent);
  const events = [...fixture.events].sort((a, b) => a.time - b.time);
  const fixtureName = `${fixture.id}.json`;
  const scrubber = byId("scrubber");
  const play = byId("play");
  const speed = byId("speed");
  const issue = byId("issue-dialog");
  const issueButton = byId("issue-cta");
  const evidenceCount = byId("evidence-count");
  const status = byId("status");
  const issueStatus = document.createElement("div");
  issueStatus.id = "issue-status";
  issueStatus.className = "status-message";
  issueStatus.setAttribute("role", "status");
  issue.append(issueStatus);
  const evidence = new Map();
  const markers = new Map();
  const pinned = new Set();

  const issueFields = {
    title: byId("issue-title"),
    expected: byId("issue-expected"),
    observed: byId("issue-observed"),
    steps: byId("issue-steps"),
    owner: byId("issue-owner"),
    cause: byId("issue-cause"),
  };

  let time = Math.max(0, fixture.interruption - 2);
  let playing = false;
  let frame = 0;
  let lastFrame;
  let lastSecond = -1;
  let selectedEvent;
  let statusTimer;

  function formatTime(seconds) {
    const rounded = Math.floor(seconds);
    const minutes = String(Math.floor(rounded / 60)).padStart(2, "0");
    const remainder = String(rounded % 60).padStart(2, "0");
    return `${minutes}:${remainder}`;
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  }

  function announce(message) {
    const target = issue.open ? issueStatus : status;
    clearTimeout(statusTimer);
    status.textContent = "";
    issueStatus.textContent = "";
    target.textContent = message;
    statusTimer = setTimeout(() => { target.textContent = ""; }, 3000);
  }

  function setSelected(event) {
    if (event === selectedEvent) return;
    if (selectedEvent) {
      markers.get(selectedEvent.id)?.removeAttribute("aria-current");
      const previous = evidence.get(selectedEvent.id);
      if (previous) {
        previous.card.dataset.selected = "false";
        previous.jump.removeAttribute("aria-current");
      }
    }
    selectedEvent = event;
    if (!event) return;
    markers.get(event.id)?.setAttribute("aria-current", "true");
    const active = evidence.get(event.id);
    if (active) {
      active.card.dataset.selected = "true";
      active.jump.setAttribute("aria-current", "true");
    }
  }

  function renderTime() {
    scrubber.style.setProperty("--progress", `${(time / fixture.duration) * 100}%`);
    const second = Math.floor(time);
    if (second !== lastSecond) {
      lastSecond = second;
      const timestamp = formatTime(second);
      scrubber.value = second;
      scrubber.setAttribute("aria-valuetext", `${timestamp} of ${formatTime(fixture.duration)}`);
      byId("current-time").textContent = timestamp;
      const state = byId("vehicle-state");
      const isPaused = second >= fixture.interruption;
      state.textContent = isPaused ? "Paused" : "Driving";
      state.dataset.state = isPaused ? "paused" : "driving";

      const waypoints = events.filter((event) => event.kind === "waypoint" && event.time <= second);
      const latestWaypoint = waypoints.at(-1);
      const reached = latestWaypoint?.waypoint ?? waypoints.length;
      byId("waypoint-state").textContent = `${reached} / ${fixture.waypointTotal ?? 3}`;
      setSelected(events.findLast((event) => event.time <= second));
    }
    window.dispatchEvent(new CustomEvent("replaytime", { detail: { time } }));
  }

  function setPlaying(next) {
    playing = next;
    lastFrame = undefined;
    cancelAnimationFrame(frame);
    const label = playing ? "Pause replay" : "Play replay";
    play.dataset.playing = String(playing);
    play.setAttribute("aria-label", label);
    play.title = label;
    if (playing) frame = requestAnimationFrame(tick);
  }

  function tick(timestamp) {
    const elapsed = lastFrame === undefined ? 0 : (timestamp - lastFrame) / 1000;
    time = Math.min(fixture.duration, time + elapsed * (parseFloat(speed.value) || 1));
    lastFrame = timestamp;
    renderTime();
    if (time === fixture.duration) {
      setPlaying(false);
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function seek(seconds, event) {
    setPlaying(false);
    time = Math.max(0, Math.min(fixture.duration, seconds));
    renderTime();
    if (event) setSelected(event);
  }

  function renderMarkers() {
    const container = byId("timeline-markers");
    let lane = 0;
    let previousTime = -Infinity;
    for (const event of events) {
      lane = event.time - previousTime <= 2 ? lane + 1 : 0;
      previousTime = event.time;
      const button = element("button", "timeline-marker");
      button.type = "button";
      button.dataset.kind = event.kind;
      button.style.left = `${(event.time / fixture.duration) * 100}%`;
      button.style.setProperty("--marker-lane", lane);
      button.title = `${formatTime(event.time)} · ${event.title}`;
      button.setAttribute("aria-label", `Seek to ${formatTime(event.time)}, ${event.title}`);
      button.addEventListener("click", () => seek(event.time, event));
      markers.set(event.id, button);
      container.append(button);
    }
  }

  function renderEvidence() {
    const list = byId("evidence-list");
    for (const event of events.filter((item) => item.evidence)) {
      const card = element(list.matches("ol, ul") ? "li" : "article", "evidence-card");
      card.dataset.kind = event.kind;
      card.dataset.selected = "false";
      card.dataset.pinned = "false";

      const jump = element("button", "evidence-event");
      jump.type = "button";
      jump.setAttribute("aria-label", `${formatTime(event.time)} ${event.source}, ${event.title}, ${event.id}`);
      jump.addEventListener("click", () => seek(event.time, event));
      const metadata = element("span", "evidence-meta");
      metadata.append(
        element("span", "evidence-time", formatTime(event.time)),
        element("span", "evidence-source", event.source),
        element("span", "evidence-id", event.id),
      );
      const detail = element("span", "evidence-detail", event.detail);
      detail.id = `detail-${event.id}`;
      jump.setAttribute("aria-describedby", detail.id);
      jump.append(metadata, element("span", "evidence-title", event.title), detail);

      const pin = element("button", "pin-button");
      pin.type = "button";
      pin.setAttribute("aria-label", `Pin ${event.id} ${event.title} as evidence`);
      pin.setAttribute("aria-pressed", "false");
      const pinIcon = element("span", "pin-icon");
      pinIcon.setAttribute("aria-hidden", "true");
      const pinLabel = element("span", "pin-label", "Pin");
      pin.append(pinIcon, pinLabel);
      pin.addEventListener("click", () => togglePin(event));
      const actions = element("div", "evidence-actions");
      actions.append(pin, element("span", "evidence-selected", `Selected · ${formatTime(event.time)}`));
      card.append(jump, actions);
      list.append(card);
      evidence.set(event.id, { card, jump, pin, pinLabel });
    }
  }

  function togglePin(event) {
    const isPinned = !pinned.has(event.id);
    if (isPinned) pinned.add(event.id);
    else pinned.delete(event.id);
    const row = evidence.get(event.id);
    row.card.dataset.pinned = String(isPinned);
    row.pin.setAttribute("aria-pressed", String(isPinned));
    row.pinLabel.textContent = isPinned ? "Pinned" : "Pin";
    updateEvidenceCount();
    announce(`${event.id} ${isPinned ? "pinned" : "unpinned"}. ${pinned.size} pinned.`);
  }

  function updateEvidenceCount() {
    evidenceCount.textContent = `${pinned.size} pinned`;
    issueButton.disabled = pinned.size === 0;
  }

  function pinnedEvents() {
    return events.filter((event) => pinned.has(event.id));
  }

  function populateDraft() {
    issueFields.title.value = "Replay mislabels a scripted pause as an operator stop";
    issueFields.expected.value = "The marker identifies the scripted pause recorded in E-031.";
    issueFields.observed.value = "Marker R-014 says “Operator stop.” The simulator event attributes the pause to the test script.";
    issueFields.steps.value = [
      `Open the prototype. It loads ${fixture.id} from simulated build ${fixture.build}.`,
      "Seek to 01:10 and play through 01:13.",
      "Select the stop marker R-014 and compare its label with source event E-031.",
    ].join("\n");
    issueFields.owner.value = "Replay UI";
    issueFields.cause.value = "Unconfirmed";
  }

  function openIssue() {
    setPlaying(false);
    const entries = pinnedEvents().map((event) => {
      const item = element("li", "issue-evidence-item");
      item.append(
        element("strong", "issue-evidence-title", event.title),
        element("span", "issue-evidence-meta", `${formatTime(event.time)} · ${event.source} · ${event.id}`),
      );
      return item;
    });
    byId("issue-evidence").replaceChildren(...entries);
    issue.showModal();
  }

  function issueMarkdown() {
    const value = (field) => issueFields[field].value.trim() || "Unspecified";
    const steps = value("steps").split("\n").filter((line) => line.trim());
    return [
      `# ${value("title")}`,
      "",
      "> SCENARIO · NOT LIVE. Independent portfolio concept using simulated data.",
      "",
      `- Run ${fixture.id}`,
      `- Simulated build ${fixture.build}`,
      `- Fixture [${fixtureName}](./${fixtureName})`,
      "- Review window 01:10–01:20 elapsed",
      "",
      "## Reproduction steps",
      "",
      ...steps.map((step, index) => `${index + 1}. ${step.trim().replace(/^\d+\.\s+/, "")}`),
      "",
      "## Expected behavior",
      "",
      value("expected"),
      "",
      "## Observed behavior",
      "",
      value("observed"),
      "",
      "## Pinned evidence",
      "",
      ...pinnedEvents().map((event) => `- ${formatTime(event.time)} · ${event.source} · ${event.id} — ${event.title}. ${event.detail}`),
      "",
      `**Root cause** — ${value("cause")}`,
      "",
      `**Suggested owner** — ${value("owner")}`,
      "",
    ].join("\n");
  }

  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = element("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce(`${filename} downloaded.`);
  }

  function copyWithSelection(text) {
    const focused = document.activeElement;
    const selection = element("textarea");
    selection.value = text;
    selection.readOnly = true;
    selection.style.cssText = "position:fixed; left:-1000px; top:0";
    issue.append(selection);
    selection.select();
    try {
      return document.execCommand("copy");
    } finally {
      selection.remove();
      focused.focus();
    }
  }

  async function copyIssue() {
    const markdown = issueMarkdown();
    try {
      await navigator.clipboard.writeText(markdown);
      announce("Issue copied as Markdown.");
    } catch {
      let copied = false;
      try {
        copied = copyWithSelection(markdown);
      } catch {
        // The download remains available if the browser blocks both clipboard methods.
      }
      announce(copied ? "Issue copied as Markdown." : "Clipboard unavailable. Use Download issue.");
    }
  }

  play.addEventListener("click", () => {
    if (time >= fixture.duration) seek(0);
    setPlaying(!playing);
  });
  byId("restart").addEventListener("click", () => seek(0));
  byId("jump-interruption").addEventListener("click", () => seek(fixture.interruption));
  scrubber.addEventListener("input", () => seek(Number(scrubber.value)));
  issueButton.addEventListener("click", openIssue);
  byId("close-issue").addEventListener("click", () => issue.close());
  byId("copy-issue").addEventListener("click", copyIssue);
  byId("download-issue").addEventListener("click", () => {
    download(`${fixture.id}-issue.md`, issueMarkdown(), "text/markdown;charset=utf-8");
  });
  byId("download-fixture").addEventListener("click", () => {
    const telemetry = { ...fixture.telemetry, samples: window.simulatedTelemetry.samples };
    const exportedFixture = { ...fixture, telemetry };
    download(fixtureName, `${JSON.stringify(exportedFixture, null, 2)}\n`, "application/json;charset=utf-8");
  });

  scrubber.max = fixture.duration;
  byId("current-time").setAttribute("aria-live", "off");
  byId("total-time").textContent = formatTime(fixture.duration);
  renderMarkers();
  renderEvidence();
  populateDraft();
  updateEvidenceCount();
  setPlaying(false);
  renderTime();
})();
