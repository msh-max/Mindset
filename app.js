const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const els = {
  apiKey: $("#apiKey"),
  model: $("#model"),
  saveKey: $("#saveKey"),
  goals: $("#goals"),
  fears: $$(".fears input[type=checkbox]"),
  analyze: $("#analyze"),
  status: $("#status"),
  results: $("#results"),
};

const PALETTE = {
  text: "#16263f",
  muted: "#5b6b85",
  grid: "#dbe5f2",
  sky: "#0ea5e9",
  skyDeep: "#0369a1",
  skyFill: "rgba(14, 165, 233, 0.22)",
  dim: "#94a3b8",
  dimFill: "rgba(148, 163, 184, 0.28)",
};

(function restore() {
  const k = localStorage.getItem("mindset.apiKey");
  if (k) els.apiKey.value = k;
  const m = localStorage.getItem("mindset.model");
  if (m) els.model.value = m;
  const g = localStorage.getItem("mindset.goals");
  if (g) els.goals.value = g;
})();

els.saveKey.addEventListener("click", () => {
  localStorage.setItem("mindset.apiKey", els.apiKey.value.trim());
  localStorage.setItem("mindset.model", els.model.value);
  setStatus("Saved to this browser.", false);
});

els.goals.addEventListener("input", () => {
  localStorage.setItem("mindset.goals", els.goals.value);
});

els.analyze.addEventListener("click", run);

function setStatus(msg, isError = false) {
  els.status.classList.remove("hidden", "error");
  if (isError) els.status.classList.add("error");
  els.status.textContent = msg;
}
function clearStatus() {
  els.status.classList.add("hidden");
  els.status.textContent = "";
}

async function run() {
  const apiKey = els.apiKey.value.trim();
  const model = els.model.value;
  const goals = els.goals.value.trim();
  const selectedFears = els.fears.filter((c) => c.checked).map((c) => c.value);

  if (!apiKey) return setStatus("Add your OpenAI API key first.", true);
  if (!goals) return setStatus("Write down at least one weekly goal.", true);
  if (selectedFears.length === 0)
    return setStatus("Pick at least one fear to examine.", true);

  els.analyze.disabled = true;
  els.results.innerHTML = "";
  setStatus("Reading the cost of each fear…", false);

  try {
    const analyses = await Promise.all(
      selectedFears.map((fear, i) =>
        analyzeFear({ apiKey, model, goals, fear, chartStyle: secondaryChartFor(i) })
      )
    );
    clearStatus();
    analyses.forEach((data, i) =>
      renderFear(selectedFears[i], data, secondaryChartFor(i))
    );
    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    console.error(err);
    setStatus(`Something went wrong: ${err.message}`, true);
  } finally {
    els.analyze.disabled = false;
  }
}

function secondaryChartFor(i) {
  return ["bar", "radar", "polar", "doughnut"][i % 4];
}

async function analyzeFear({ apiKey, model, goals, fear, chartStyle }) {
  const system = `You are a direct, no-fluff coach. You write short, sharp lines that land emotionally. You never pad. You always return valid JSON only.`;

  const user = `My weekly goals:
${goals}

Fear to analyze: "${fear}"

Return JSON with EXACTLY this shape:

{
  "if_you_dont": [
    "3 short bullets. Max 14 words each. Concrete consequence of letting this fear win, tied to my goals. Second person ('you'). No fluff."
  ],
  "if_you_do": [
    "3 short bullets. Max 14 words each. Concrete win from facing this fear, tied to my goals. Second person. No fluff."
  ],
  "trajectory": {
    "labels": ["Now", "6mo", "1yr", "3yr", "5yr", "10yr"],
    "with_fear": [70, 62, 54, 40, 28, 16],
    "without_fear": [70, 78, 84, 91, 95, 98]
  },
  "domains": {
    "categories": ["Pick 5 life domains MOST relevant to THIS fear and these goals — be specific, e.g. 'Network', 'Income ceiling', 'Self-trust', not generic 'Career'."],
    "with_fear": [5 numbers 0-100, how much that domain suffers],
    "without_fear": [5 numbers 0-100, how strong that domain becomes]
  },
  "wakeup_call": "ONE sentence. Max 25 words. Vivid, concrete, references my goals. Punch to the chest, not a lecture."
}

Rules:
- Bullets MUST be short. If a bullet is longer than 14 words, rewrite it.
- Domain categories MUST be tailored to this specific fear, not generic.
- Numbers should make the gap clear but believable.
- JSON only. No markdown, no extra keys.`;

  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.8,
    response_format: { type: "json_object" },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");

  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error("Model did not return valid JSON. Try again.");
  }
}

function renderFear(fear, data, chartStyle) {
  const id = "fear-" + Math.random().toString(36).slice(2, 8);
  const wrap = document.createElement("section");
  wrap.className = "fear-result";

  const secondaryTitle = {
    bar: "Where life shrinks vs. opens up",
    radar: "Where this fear hits hardest",
    polar: "What expands when you act anyway",
    doughnut: "Share of your life this fear is dimming",
  }[chartStyle];

  wrap.innerHTML = `
    <h3>${escapeHtml(fear)}</h3>
    <p class="subtitle">Two paths. Same week. Pick one.</p>

    <div class="paths">
      <div class="path dont">
        <h4>If you don't face it</h4>
        <ul>${(data.if_you_dont || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
      </div>
      <div class="path do">
        <h4>If you do</h4>
        <ul>${(data.if_you_do || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
      </div>
    </div>

    <div class="chart-grid">
      <div class="chart-wrap">
        <h4>Where you end up — 10 years out</h4>
        <canvas id="${id}-line"></canvas>
      </div>
      <div class="chart-wrap">
        <h4>${escapeHtml(secondaryTitle)}</h4>
        <canvas id="${id}-second"></canvas>
      </div>
    </div>

    <div class="wakeup">${escapeHtml(data.wakeup_call || "")}</div>
  `;
  els.results.appendChild(wrap);

  drawLine(`${id}-line`, data.trajectory);
  drawSecondary(`${id}-second`, chartStyle, data.domains);
}

function drawLine(canvasId, t) {
  if (!t) return;
  const ctx = document.getElementById(canvasId).getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: t.labels,
      datasets: [
        {
          label: "If fear wins",
          data: t.with_fear,
          borderColor: PALETTE.dim,
          backgroundColor: PALETTE.dimFill,
          borderDash: [6, 4],
          tension: 0.35,
          fill: true,
          pointRadius: 3,
        },
        {
          label: "If you act anyway",
          data: t.without_fear,
          borderColor: PALETTE.sky,
          backgroundColor: PALETTE.skyFill,
          tension: 0.35,
          fill: true,
          pointRadius: 3,
        },
      ],
    },
    options: lineOpts(),
  });
}

function drawSecondary(canvasId, style, d) {
  if (!d) return;
  const ctx = document.getElementById(canvasId).getContext("2d");
  if (style === "bar") return drawBar(ctx, d);
  if (style === "radar") return drawRadar(ctx, d);
  if (style === "polar") return drawPolar(ctx, d);
  if (style === "doughnut") return drawDoughnut(ctx, d);
}

function drawBar(ctx, d) {
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: d.categories,
      datasets: [
        {
          label: "Fear wins",
          data: d.with_fear,
          backgroundColor: PALETTE.dim,
          borderRadius: 4,
        },
        {
          label: "You act",
          data: d.without_fear,
          backgroundColor: PALETTE.sky,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: PALETTE.text, font: { size: 11 } } },
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          ticks: { color: PALETTE.muted },
          grid: { color: PALETTE.grid },
        },
        y: {
          ticks: { color: PALETTE.text, font: { size: 11 } },
          grid: { color: "transparent" },
        },
      },
    },
  });
}

function drawRadar(ctx, d) {
  new Chart(ctx, {
    type: "radar",
    data: {
      labels: d.categories,
      datasets: [
        {
          label: "Fear wins",
          data: d.with_fear,
          borderColor: PALETTE.dim,
          backgroundColor: PALETTE.dimFill,
          pointBackgroundColor: PALETTE.dim,
        },
        {
          label: "You act",
          data: d.without_fear,
          borderColor: PALETTE.sky,
          backgroundColor: PALETTE.skyFill,
          pointBackgroundColor: PALETTE.sky,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: PALETTE.text, font: { size: 11 } } },
      },
      scales: {
        r: {
          angleLines: { color: PALETTE.grid },
          grid: { color: PALETTE.grid },
          pointLabels: { color: PALETTE.text, font: { size: 11 } },
          ticks: {
            color: PALETTE.muted,
            backdropColor: "transparent",
            stepSize: 25,
          },
          suggestedMin: 0,
          suggestedMax: 100,
        },
      },
    },
  });
}

function drawPolar(ctx, d) {
  const skyShades = [
    "rgba(14,165,233,0.75)",
    "rgba(56,189,248,0.70)",
    "rgba(125,211,252,0.70)",
    "rgba(2,132,199,0.70)",
    "rgba(186,230,253,0.75)",
  ];
  new Chart(ctx, {
    type: "polarArea",
    data: {
      labels: d.categories,
      datasets: [
        {
          label: "If you act",
          data: d.without_fear,
          backgroundColor: skyShades,
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { color: PALETTE.text, font: { size: 11 }, boxWidth: 12 } },
      },
      scales: {
        r: {
          angleLines: { color: PALETTE.grid },
          grid: { color: PALETTE.grid },
          ticks: { display: false },
          suggestedMin: 0,
          suggestedMax: 100,
        },
      },
    },
  });
}

function drawDoughnut(ctx, d) {
  const dimmed = d.with_fear.reduce((a, b) => a + b, 0) / d.with_fear.length;
  const alive = Math.max(0, 100 - dimmed);
  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Dimmed by this fear", "Still yours"],
      datasets: [
        {
          data: [Math.round(dimmed), Math.round(alive)],
          backgroundColor: [PALETTE.dim, PALETTE.sky],
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom", labels: { color: PALETTE.text, font: { size: 12 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (c) => `${c.label}: ${c.parsed}%`,
          },
        },
      },
    },
  });
}

function lineOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: PALETTE.text, font: { size: 11 } } },
      tooltip: { mode: "index", intersect: false },
    },
    scales: {
      x: {
        ticks: { color: PALETTE.muted },
        grid: { color: PALETTE.grid },
      },
      y: {
        min: 0,
        max: 100,
        ticks: { color: PALETTE.muted },
        grid: { color: PALETTE.grid },
      },
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
