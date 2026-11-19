(() => {
  const canvas = document.getElementById("course-map");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  const terrain = document.createElement("canvas");
  const terrainContext = terrain.getContext("2d");
  if (!terrainContext) return;

  const fixture = JSON.parse(document.getElementById("run-fixture").textContent);
  const firstWaypoint = fixture.events.find(event => event.waypoint === 1).time;
  const secondWaypoint = fixture.events.find(event => event.waypoint === 2).time;
  const interruption = fixture.interruption;
  const plannedEnd = interruption + 28;
  const route = [
    { time: 0, x: 0.10, y: 0.72 },
    { time: firstWaypoint, x: 0.24, y: 0.68, controls: [0.16, 0.78, 0.20, 0.74] },
    { time: (firstWaypoint + secondWaypoint) / 2, x: 0.36, y: 0.49, controls: [0.28, 0.60, 0.30, 0.50] },
    { time: secondWaypoint, x: 0.55, y: 0.57, controls: [0.42, 0.46, 0.47, 0.62] },
    { time: interruption, x: 0.64, y: 0.49, controls: [0.58, 0.55, 0.61, 0.51] },
    { time: (interruption + plannedEnd) / 2, x: 0.75, y: 0.44, controls: [0.68, 0.47, 0.72, 0.49] },
    { time: plannedEnd, x: 0.87, y: 0.29, controls: [0.81, 0.36, 0.81, 0.30] },
  ];

  const elevationGrid = window.ellensburgTerrain;
  const minimumElevation = elevationGrid ? Math.min(...elevationGrid.elevationMeters) : 0;
  const maximumElevation = elevationGrid ? Math.max(...elevationGrid.elevationMeters) : 0;

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let currentTime = secondWaypoint;
  let regionWidth = 1;
  let regionHeight = 1;

  function elevation(x, y) {
    const { columns, rows, elevationMeters } = elevationGrid;
    const column = Math.max(0, Math.min(1, 0.5 + (x - 0.5) * regionWidth)) * (columns - 1);
    const row = Math.max(0, Math.min(1, 0.5 + (y - 0.5) * regionHeight)) * (rows - 1);
    const left = Math.min(Math.floor(column), columns - 2);
    const top = Math.min(Math.floor(row), rows - 2);
    const xWeight = column - left;
    const yWeight = row - top;
    const index = top * columns + left;
    const upper = elevationMeters[index] * (1 - xWeight) + elevationMeters[index + 1] * xWeight;
    const lower = elevationMeters[index + columns] * (1 - xWeight) + elevationMeters[index + columns + 1] * xWeight;
    return upper * (1 - yWeight) + lower * yWeight;
  }

  function drawRelief(target) {
    const relief = document.createElement("canvas");
    relief.width = Math.max(40, Math.ceil(width / 3));
    relief.height = Math.max(40, Math.ceil(height / 3));
    const reliefContext = relief.getContext("2d");
    const image = reliefContext.createImageData(relief.width, relief.height);

    for (let row = 0; row < relief.height; row += 1) {
      for (let column = 0; column < relief.width; column += 1) {
        const x = column / (relief.width - 1);
        const y = row / (relief.height - 1);
        const meters = elevation(x, y);
        const altitude = (meters - minimumElevation) / (maximumElevation - minimumElevation);
        const gradient = elevation(x - 0.014 / regionWidth, y - 0.014 / regionHeight) - meters;
        const light = Math.max(-14, Math.min(16, gradient * 0.14));
        const pixel = (row * relief.width + column) * 4;
        image.data[pixel] = 20 + altitude * 33 + light;
        image.data[pixel + 1] = 31 + altitude * 33 + light;
        image.data[pixel + 2] = 32 + altitude * 16 + light;
        image.data[pixel + 3] = 255;
      }
    }

    reliefContext.putImageData(image, 0, 0);
    target.drawImage(relief, 0, 0, width, height);
  }

  function drawContours(target) {
    const columns = Math.ceil(width / 6);
    const rows = Math.ceil(height / 6);
    const values = Array.from({ length: rows + 1 }, (_, row) => (
      Array.from({ length: columns + 1 }, (_, column) => elevation(column / columns, row / rows))
    ));
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    const labels = [];
    const interval = elevationGrid.contourMeters;

    function segment(points, start, end) {
      target.moveTo(points[start][0] * cellWidth, points[start][1] * cellHeight);
      target.lineTo(points[end][0] * cellWidth, points[end][1] * cellHeight);
    }

    for (let level = Math.ceil(minimumElevation / interval) * interval; level < maximumElevation; level += interval) {
      const indexed = level % (interval * 5) === 0;
      target.strokeStyle = indexed ? "rgba(179, 188, 160, 0.47)" : "rgba(166, 180, 155, 0.25)";
      target.lineWidth = indexed ? 1 : 0.7;
      target.beginPath();
      let bestLabel;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const corners = [
            values[row][column], values[row][column + 1],
            values[row + 1][column + 1], values[row + 1][column],
          ];
          const mask = corners.reduce((bits, value, corner) => bits | ((value >= level) << corner), 0);
          if (mask === 0 || mask === 15) continue;

          const crossings = [];
          const offsets = [[0, 0], [1, 0], [1, 1], [0, 1]];

          for (let edge = 0; edge < 4; edge += 1) {
            const next = (edge + 1) % 4;
            if ((corners[edge] >= level) === (corners[next] >= level)) continue;

            const progress = (level - corners[edge]) / (corners[next] - corners[edge]);
            crossings.push([
              column + offsets[edge][0] + (offsets[next][0] - offsets[edge][0]) * progress,
              row + offsets[edge][1] + (offsets[next][1] - offsets[edge][1]) * progress,
            ]);
          }

          if (crossings.length === 2) {
            segment(crossings, 0, 1);
            if (indexed) {
              const x = (crossings[0][0] + crossings[1][0]) * cellWidth / 2;
              const y = (crossings[0][1] + crossings[1][1]) * cellHeight / 2;
              const withinMargins = x > 42 && x < width - 42 && y > 52 && y < height - 40;
              const clearOfRoute = (x < width * 0.53 && y < height * 0.43) || y > height * 0.82;
              const clearOfLabels = labels.every(label => Math.hypot(label.x - x, label.y - y) > 60);
              if (withinMargins && clearOfRoute && clearOfLabels) {
                const score = Math.hypot(x - width * 0.25, y - height * 0.27);
                if (!bestLabel || score < bestLabel.score) bestLabel = { x, y, level, score };
              }
            }
          } else if ((corners.reduce((sum, value) => sum + value, 0) / 4 >= level) === (mask === 5)) {
            segment(crossings, 0, 1);
            segment(crossings, 2, 3);
          } else {
            segment(crossings, 0, 3);
            segment(crossings, 1, 2);
          }
        }
      }

      target.stroke();
      if (bestLabel) labels.push(bestLabel);
    }

    target.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    target.textAlign = "center";
    target.textBaseline = "middle";
    target.strokeStyle = "#202b27";
    target.lineJoin = "round";
    target.lineWidth = 3.5;
    target.fillStyle = "#b8c2a8";
    for (const { x, y, level } of labels) {
      target.strokeText(`${level} m`, x, y);
      target.fillText(`${level} m`, x, y);
    }
  }

  function drawTerrain() {
    terrainContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (!elevationGrid) {
      terrainContext.fillStyle = "#172221";
      terrainContext.fillRect(0, 0, width, height);
      return;
    }

    const geographicAspect = ((elevationGrid.columns - 1) * elevationGrid.cellWidthMeters)
      / ((elevationGrid.rows - 1) * elevationGrid.cellHeightMeters);
    const viewportAspect = width / height;
    regionWidth = Math.min(1, viewportAspect / geographicAspect);
    regionHeight = Math.min(1, geographicAspect / viewportAspect);
    drawRelief(terrainContext);
    drawContours(terrainContext);
  }

  function pathPosition(time) {
    const boundedTime = Math.min(Math.max(0, time), route.at(-1).time);
    const endIndex = route.findIndex((point, index) => index > 0 && point.time >= boundedTime);
    const start = route[endIndex - 1];
    const end = route[endIndex];
    const [firstX, firstY, secondX, secondY] = end.controls;
    const progress = (boundedTime - start.time) / (end.time - start.time);
    const remaining = 1 - progress;
    const startWeight = remaining ** 3;
    const firstWeight = 3 * progress * remaining ** 2;
    const secondWeight = 3 * progress ** 2 * remaining;
    const endWeight = progress ** 3;

    return {
      x: (start.x * startWeight + firstX * firstWeight + secondX * secondWeight + end.x * endWeight) * width,
      y: (start.y * startWeight + firstY * firstWeight + secondY * secondWeight + end.y * endWeight) * height,
    };
  }

  function drawRoute(start, end, color, lineWidth, dash = []) {
    if (end <= start) return;
    const samples = Math.max(6, Math.ceil((end - start) * 1.5));
    const first = pathPosition(start);
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.setLineDash(dash);
    context.beginPath();
    context.moveTo(first.x, first.y);

    for (let sample = 1; sample <= samples; sample += 1) {
      const point = pathPosition(start + (end - start) * (sample / samples));
      context.lineTo(point.x, point.y);
    }

    context.stroke();
    context.setLineDash([]);
  }

  function dot(point, radius, fill, stroke, lineWidth = 1) {
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    if (!stroke) return;
    context.lineWidth = lineWidth;
    context.strokeStyle = stroke;
    context.stroke();
  }

  function label(text, point, offsetX, offsetY, color, align = "center") {
    context.textAlign = align;
    context.textBaseline = "middle";
    context.font = '600 10px "IBM Plex Mono", ui-monospace, monospace';
    context.strokeStyle = "#172221";
    context.lineWidth = 4;
    context.lineJoin = "round";
    context.strokeText(text, point.x + offsetX, point.y + offsetY);
    context.fillStyle = color;
    context.fillText(text, point.x + offsetX, point.y + offsetY);
  }

  function drawCourse() {
    if (!width || !height) return;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.drawImage(terrain, 0, 0, width, height);
    context.lineJoin = "round";
    context.lineCap = "round";

    const drivenTime = Math.min(currentTime, interruption);
    drawRoute(0, drivenTime, "rgba(19, 32, 28, 0.8)", 6);
    drawRoute(0, drivenTime, "#b9e2cd", 2.5);
    drawRoute(drivenTime, plannedEnd, "rgba(163, 193, 174, 0.64)", 2, [4, 6]);

    const start = pathPosition(0);
    const checkpointOne = pathPosition(firstWaypoint);
    const checkpointTwo = pathPosition(secondWaypoint);
    const pause = pathPosition(interruption);
    const finish = pathPosition(plannedEnd);

    dot(start, 3, "#1a2c27", "#bdd9c8", 1.5);
    dot(checkpointOne, 4.5, "#1a2c27", "#bdd9c8", 1.5);
    dot(checkpointTwo, 4.5, "#1a2c27", "#bdd9c8", 1.5);
    dot(finish, 4.5, "#1a2c27", "#8fa99a", 1.5);
    dot(pause, 10, "rgba(248, 188, 118, 0.13)", "rgba(248, 188, 118, 0.65)");
    dot(pause, 4, "#f8bc76", "#1c2721", 1.5);

    label("START", start, 0, 17, "#b7ccc0");
    label("WP 01", checkpointOne, 0, 17, "#b7ccc0");
    label("WP 02", checkpointTwo, 0, 18, "#b7ccc0");
    label("WP 03", finish, 0, -15, "#b7ccc0");
    label("PAUSE", pause, 0, -19, "#f8bc76");

    if (currentTime < interruption) {
      const position = pathPosition(drivenTime);
      dot(position, 8, "rgba(185, 226, 205, 0.21)", "rgba(185, 226, 205, 0.55)");
      dot(position, 3.5, "#d6fae5");
    }
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const nextPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (width === box.width && height === box.height && pixelRatio === nextPixelRatio) return;

    width = box.width;
    height = box.height;
    pixelRatio = nextPixelRatio;
    canvas.width = terrain.width = Math.round(width * pixelRatio);
    canvas.height = terrain.height = Math.round(height * pixelRatio);
    drawTerrain();
    drawCourse();
  }

  new ResizeObserver(resize).observe(canvas);
  resize();

  window.addEventListener("replaytime", event => {
    const time = event.detail?.time;
    if (!Number.isFinite(time) || currentTime === time) return;
    currentTime = time;
    drawCourse();
  });
})();
