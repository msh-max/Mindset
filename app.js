const $ = (sel) => document.querySelector(sel);

const FEARS = [
  { key: "Fear of rejection", desc: "Avoiding people, opportunities, asking for what you want." },
  { key: "Fear of failure", desc: "Stuck planning and preparing instead of doing." },
  { key: "Fear of judgment", desc: "Living for others' opinions instead of your values." },
  { key: "Fear of discomfort", desc: "Choosing easy dopamine over growth." },
];

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

const els = {
  apiKey: $("#apiKey"),
  model: $("#model"),
  saveKey: $("#saveKey"),
  goalsList: $("#goalsList"),
  addGoal: $("#addGoal"),
  analyze: $("#analyze"),
  status: $("#status"),
  results: $("#results"),
  trackerSection: $("#trackerSection"),
  trackerChecklist: $("#trackerChecklist"),
  overallPct: $("#overallPct"),
  doneCount: $("#doneCount"),
  totalCount: $("#totalCount"),
  xpCount: $("#xpCount"),
  steeringCanvas: $("#steeringCanvas"),
  downloadPdf: $("#downloadPdf"),
  pdfRegion: $("#pdfRegion"),
};

let goals = [];        // [{ id, trigger, action, goal }]
let tracker = [];      // [{ id, label, badge, done }]
let steeringChart = null;

// ---------- restore ----------
(function restore() {
  const k = localStorage.getItem("mindset.apiKey");
  if (k) els.apiKey.value = k;
  const m = localStorage.getItem("mindset.model");
  if (m) els.model.value = m;

  const savedGoals = safeParse(localStorage.getItem("mindset.goals.v2"));
  if (Array.isArray(savedGoals) && savedGoals.length) {
    goals = savedGoals;
  } else {
    goals = [newGoalRow()];
  }
  renderGoals();

  const savedTracker = safeParse(localStorage.getItem("mindset.tracker"));
  if (Array.isArray(savedTracker) && savedTracker.length) {
    tracker = savedTracker;
    showTracker();
  }
})();

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

// ---------- key ----------
els.saveKey.addEventListener("click", () => {
  localStorage.setItem("mindset.apiKey", els.apiKey.value.trim());
  localStorage.setItem("mindset.model", els.model.value);
  setStatus("Saved to this browser.", false);
});

// ---------- goals ----------
function newGoalRow() {
  return { id: rid(), trigger: "", action: "", goal: "" };
}
function rid() { return Math.random().toString(36).slice(2, 9); }

function renderGoals() {
  els.goalsList.innerHTML = "";
  goals.forEach((g, idx) => {
    const row = document.createElement("div");
    row.className = "goal-row";
    row.innerHTML = `
      <div class="field">
        <label>When (trigger)</label>
        <input type="text" data-id="${g.id}" data-k="trigger" placeholder="I sit down at my desk at 9am" value="${escapeAttr(g.trigger)}" />
      </div>
      <div class="field">
        <label>I will (action)</label>
        <input type="text" data-id="${g.id}" data-k="action" placeholder="open the proposal doc and write for 25 min" value="${escapeAttr(g.action)}" />
      </div>
      <div class="field">
        <label>Which leads me to (goal)</label>
        <input type="text" data-id="${g.id}" data-k="goal" placeholder="finish the project proposal this week" value="${escapeAttr(g.goal)}" />
      </div>
      <button class="remove-goal" data-remove="${g.id}" title="Remove">×</button>
    `;
    els.goalsList.appendChild(row);
  });

  els.goalsList.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const id = e.target.dataset.id;
      const k = e.target.dataset.k;
      const g = goals.find((x) => x.id === id);
      if (g) { g[k] = e.target.value; persistGoals(); }
    });
  });
  els.goalsList.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.remove;
      goals = goals.filter((x) => x.id !== id);
      if (!goals.length) goals.push(newGoalRow());
      persistGoals();
      renderGoals();
    });
  });
}

function persistGoals() {
  localStorage.setItem("mindset.goals.v2", JSON.stringify(goals));
}

els.addGoal.addEventListener("click", () => {
  goals.push(newGoalRow());
  persistGoals();
  renderGoals();
});

// ---------- run ----------
els.analyze.addEventListener("click", run);
els.downloadPdf.addEventListener("click", downloadPdf);

function downloadPdf() {
  if (typeof html2pdf === "undefined") {
    setStatus("PDF library failed to load. Check your connection and refresh.", true);
    return;
  }
  const region = els.pdfRegion;
  if (!region || !region.children.length) {
    setStatus("Nothing to export yet — run an analysis first.", true);
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const opts = {
    margin: [10, 10, 10, 10],
    filename: `mindset-${stamp}.pdf`,
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"], avoid: [".goal-result", ".fear-card", ".tracker-summary", ".steering-wrap"] },
  };
  els.downloadPdf.disabled = true;
  const prevLabel = els.downloadPdf.textContent;
  els.downloadPdf.textContent = "Generating PDF…";
  html2pdf().set(opts).from(region).save()
    .catch((err) => setStatus(`PDF failed: ${err.message}`, true))
    .finally(() => {
      els.downloadPdf.disabled = false;
      els.downloadPdf.textContent = prevLabel;
    });
}

function setStatus(msg, isError = false) {
  els.status.classList.remove("hidden", "error");
  if (isError) els.status.classList.add("error");
  els.status.textContent = msg;
}
function clearStatus() {
  els.status.classList.add("hidden");
  els.status.textContent = "";
}

function validGoals() {
  return goals
    .map((g) => ({
      id: g.id,
      trigger: g.trigger.trim(),
      action: g.action.trim(),
      goal: g.goal.trim(),
    }))
    .filter((g) => g.trigger && g.action && g.goal);
}

async function run() {
  const apiKey = els.apiKey.value.trim();
  const model = els.model.value;
  const filled = validGoals();

  if (!apiKey) return setStatus("Add your OpenAI API key first.", true);
  if (!filled.length) return setStatus("Fill in at least one full goal (trigger, action, goal).", true);

  els.analyze.disabled = true;
  els.results.innerHTML = "";
  setStatus("Asking the coach how each fear will try to stop you…", false);

  try {
    const data = await analyzeAll({ apiKey, model, goals: filled });
    clearStatus();
    renderResults(filled, data);
    buildTracker(filled);
    els.downloadPdf.classList.remove("hidden");
    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    console.error(err);
    setStatus(`Something went wrong: ${err.message}`, true);
  } finally {
    els.analyze.disabled = false;
  }
}

async function analyzeAll({ apiKey, model, goals }) {
  const system = `You are a direct, no-fluff coach. You write short, sharp lines that land emotionally. You never pad. You always return valid JSON only.`;

  const goalsList = goals
    .map((g, i) => `Goal ${i + 1}:
  Trigger: "${g.trigger}"
  Action: "${g.action}"
  Goal: "${g.goal}"`)
    .join("\n\n");

  const fearsList = FEARS.map((f) => `- "${f.key}"`).join("\n");

  const user = `My goals (in trigger → action → goal format):

${goalsList}

The four fears to address for EVERY goal:
${fearsList}

For EACH goal, for EACH of the four fears above, write ONE short, specific sentence describing exactly how that fear will try to stop me from doing THIS specific action and reaching THIS specific goal. Reference the actual trigger/action/goal words. Second person ("you"). Max 24 words per sentence. No fluff. Always include all four fears for every goal — never skip one.

Also return a single overall "wakeup_call": one sentence (max 25 words) that lands like a punch, referencing my goals.

Return JSON with EXACTLY this shape:

{
  "matrix": [
    {
      "goal_index": 0,
      "fears": {
        "Fear of rejection": "...",
        "Fear of failure": "...",
        "Fear of judgment": "...",
        "Fear of discomfort": "..."
      }
    }
  ],
  "wakeup_call": "..."
}

Rules:
- "matrix" MUST contain one entry per goal, in order.
- Every entry MUST contain all four fear keys exactly as named above.
- JSON only. No markdown. No extra keys.`;

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
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { throw new Error("Model did not return valid JSON. Try again."); }
  return parsed;
}

// ---------- render results ----------
function renderResults(filledGoals, data) {
  els.results.innerHTML = "";

  const matrix = Array.isArray(data.matrix) ? data.matrix : [];

  filledGoals.forEach((g, i) => {
    const entry = matrix.find((m) => m.goal_index === i) || matrix[i] || { fears: {} };
    const fears = entry.fears || {};

    const wrap = document.createElement("section");
    wrap.className = "goal-result";
    wrap.innerHTML = `
      <h3>${escapeHtml(g.goal)}</h3>
      <p class="subtitle">When <em>${escapeHtml(g.trigger)}</em> → you will <em>${escapeHtml(g.action)}</em>. Here's how each fear will try to stop you.</p>
      <div class="fear-grid">
        ${FEARS.map((f) => `
          <div class="fear-card">
            <h5>${escapeHtml(f.key)}</h5>
            <p>${escapeHtml(fears[f.key] || "—")}</p>
          </div>
        `).join("")}
      </div>
    `;
    els.results.appendChild(wrap);
  });

  if (data.wakeup_call) {
    const wake = document.createElement("section");
    wake.className = "goal-result";
    wake.innerHTML = `<h3>Wake-up call</h3><p style="font-size:16px;font-weight:500;color:#0c3a55;margin:0">${escapeHtml(data.wakeup_call)}</p>`;
    els.results.appendChild(wake);
  }
}

// ---------- tracker ----------
function buildTracker(filledGoals) {
  const existingById = new Map(tracker.map((t) => [t.id, t]));
  const next = [];
  filledGoals.forEach((g) => {
    const id = `${g.id}:action`;
    next.push({
      id,
      label: `${g.action}`,
      badge: g.goal,
      trigger: g.trigger,
      done: existingById.get(id)?.done || false,
    });
  });
  tracker = next;
  persistTracker();
  showTracker();
}

function showTracker() {
  els.trackerSection.classList.remove("hidden");
  renderTracker();
}

function renderTracker() {
  els.trackerChecklist.innerHTML = "";
  tracker.forEach((t) => {
    const item = document.createElement("label");
    item.className = "tracker-item" + (t.done ? " done" : "");
    item.innerHTML = `
      <input type="checkbox" ${t.done ? "checked" : ""} data-id="${t.id}" />
      <div class="label"><strong>When ${escapeHtml(t.trigger || "")}</strong> → ${escapeHtml(t.label)}</div>
      <span class="badge">${escapeHtml(t.badge)}</span>
    `;
    els.trackerChecklist.appendChild(item);
  });
  els.trackerChecklist.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const id = e.target.dataset.id;
      const t = tracker.find((x) => x.id === id);
      if (t) {
        t.done = e.target.checked;
        persistTracker();
        renderTracker();
      }
    });
  });
  updateStats();
}

function persistTracker() {
  localStorage.setItem("mindset.tracker", JSON.stringify(tracker));
}

function updateStats() {
  const total = tracker.length;
  const done = tracker.filter((t) => t.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  els.overallPct.textContent = pct + "%";
  els.doneCount.textContent = done;
  els.totalCount.textContent = total;
  els.xpCount.textContent = done * 10;
  drawSteering(pct, total);
}

// ---------- steering visualization ----------
function drawSteering(pct, total) {
  const labels = ["Now", "Wk1", "Wk2", "Wk3", "Mo1", "Mo3", "Mo6", "Yr1"];
  const drift = [50, 47, 44, 40, 36, 28, 20, 12];
  const steerStrength = pct / 100;
  const course = labels.map((_, i) => {
    const base = 50;
    const climb = i * (8 + steerStrength * 6);
    return Math.min(100, Math.round(base + climb * (0.4 + steerStrength * 0.9)));
  });

  const ctx = els.steeringCanvas.getContext("2d");
  if (steeringChart) { steeringChart.destroy(); steeringChart = null; }

  steeringChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Wind drift (fear wins)",
          data: drift,
          borderColor: PALETTE.dim,
          backgroundColor: PALETTE.dimFill,
          borderDash: [6, 4],
          tension: 0.4,
          fill: true,
          pointRadius: 3,
        },
        {
          label: "Your course (you steer)",
          data: course,
          borderColor: PALETTE.sky,
          backgroundColor: PALETTE.skyFill,
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: PALETTE.text, font: { size: 12 } } },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: { ticks: { color: PALETTE.muted }, grid: { color: PALETTE.grid } },
        y: {
          min: 0,
          max: 100,
          ticks: { color: PALETTE.muted, callback: (v) => v + "%" },
          grid: { color: PALETTE.grid },
        },
      },
    },
  });
}

// ---------- utils ----------
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function escapeAttr(s) {
  return escapeHtml(s);
}
