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

// Restore saved settings
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
  setStatus("Asking the model to look honestly at each fear…", false);

  try {
    const analyses = await Promise.all(
      selectedFears.map((fear) => analyzeFear({ apiKey, model, goals, fear }))
    );
    clearStatus();
    analyses.forEach((data, i) => renderFear(selectedFears[i], data));
    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    console.error(err);
    setStatus(`Something went wrong: ${err.message}`, true);
  } finally {
    els.analyze.disabled = false;
  }
}

async function analyzeFear({ apiKey, model, goals, fear }) {
  const system = `You are a direct, no-fluff coach who helps people see the real long-term cost of letting their fears run their decisions. You are honest, specific, and motivational without being preachy. You always respond with valid JSON only — no prose outside the JSON.`;

  const user = `My weekly goals:
${goals}

Fear to analyze: "${fear}"

Return a JSON object with EXACTLY this shape and keys:

{
  "personal_impact": [
    "5 specific ways this fear could personally stop ME from achieving the goals listed above. Reference my goals concretely. Each bullet 1-2 sentences, second person ('you')."
  ],
  "others_impact": [
    "5 specific ways this same fear stops OTHER people from reaching similar goals. Real patterns, examples from real life. Each bullet 1-2 sentences."
  ],
  "trajectory": {
    "labels": ["Now", "3 months", "6 months", "1 year", "3 years", "5 years", "10 years"],
    "with_fear": [70, 60, 50, 40, 25, 15, 8],
    "without_fear": [70, 75, 82, 88, 93, 96, 98],
    "y_label": "Overall life satisfaction & progress (0-100)"
  },
  "impact_radar": {
    "categories": ["Career", "Relationships", "Confidence", "Health", "Finances", "Freedom"],
    "with_fear": [25, 30, 20, 35, 25, 20],
    "without_fear": [85, 80, 90, 80, 85, 90]
  },
  "wakeup_call": "One short, sharp paragraph (3-4 sentences) telling me what my life will actually look like in 5-10 years if I keep letting this specific fear win. Be vivid and specific, not generic. Reference the goals above."
}

Rules:
- The trajectory numbers MUST reflect what THIS specific fear does — pick numbers that make the divergence emotionally clear but believable.
- Arrays must have the exact lengths shown.
- No markdown, no comments, no extra keys. JSON only.`;

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

function renderFear(fear, data) {
  const id = "fear-" + Math.random().toString(36).slice(2, 8);
  const wrap = document.createElement("section");
  wrap.className = "fear-result";
  wrap.innerHTML = `
    <h3>${escapeHtml(fear)}</h3>
    <p class="subtitle">What this fear is quietly doing to your goals — and where it leads.</p>

    <div class="impact-grid">
      <div class="impact-block">
        <h4>How it stops YOU</h4>
        <ul>${(data.personal_impact || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
      </div>
      <div class="impact-block">
        <h4>How it stops OTHERS</h4>
        <ul>${(data.others_impact || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
      </div>
    </div>

    <div class="chart-grid">
      <div class="chart-wrap">
        <h4>Your trajectory — fear in control vs. you in control</h4>
        <canvas id="${id}-line"></canvas>
      </div>
      <div class="chart-wrap">
        <h4>Where life suffers most</h4>
        <canvas id="${id}-radar"></canvas>
      </div>
    </div>

    <div class="wakeup">${escapeHtml(data.wakeup_call || "")}</div>
  `;
  els.results.appendChild(wrap);

  drawLine(`${id}-line`, data.trajectory);
  drawRadar(`${id}-radar`, data.impact_radar);
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
          label: "If fear keeps winning",
          data: t.with_fear,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.15)",
          tension: 0.35,
          fill: true,
          pointRadius: 4,
        },
        {
          label: "If you act anyway",
          data: t.without_fear,
          borderColor: "#4ade80",
          backgroundColor: "rgba(74,222,128,0.12)",
          tension: 0.35,
          fill: true,
          pointRadius: 4,
        },
      ],
    },
    options: chartOpts({
      yTitle: t.y_label || "Progress",
      yMin: 0,
      yMax: 100,
    }),
  });
}

function drawRadar(canvasId, r) {
  if (!r) return;
  const ctx = document.getElementById(canvasId).getContext("2d");
  new Chart(ctx, {
    type: "radar",
    data: {
      labels: r.categories,
      datasets: [
        {
          label: "With fear in control",
          data: r.with_fear,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.25)",
          pointBackgroundColor: "#ef4444",
        },
        {
          label: "Without it",
          data: r.without_fear,
          borderColor: "#4ade80",
          backgroundColor: "rgba(74,222,128,0.20)",
          pointBackgroundColor: "#4ade80",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#e8ecf4", font: { size: 11 } } },
      },
      scales: {
        r: {
          angleLines: { color: "#2a3142" },
          grid: { color: "#2a3142" },
          pointLabels: { color: "#cdd4e3", font: { size: 11 } },
          ticks: {
            color: "#8a93a6",
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

function chartOpts({ yTitle, yMin, yMax }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#e8ecf4", font: { size: 11 } } },
      tooltip: { mode: "index", intersect: false },
    },
    scales: {
      x: {
        ticks: { color: "#8a93a6" },
        grid: { color: "#222838" },
      },
      y: {
        min: yMin,
        max: yMax,
        ticks: { color: "#8a93a6" },
        grid: { color: "#222838" },
        title: {
          display: !!yTitle,
          text: yTitle,
          color: "#8a93a6",
          font: { size: 11 },
        },
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
