const PROFILE_KEY = "squatTribe_v25_profile";
const HISTORY_KEY = "squatTribe_v25_history";
const ROTATION_KEY = "squatTribe_v25_rotation";

const EXERCISES = [
  { key: "back", name: "Back Squat", type: "bilateral", coeff: 0.70 },
  { key: "bulgarian", name: "Bulgarian Squat", type: "unilateral", coeff: 0.85 },
  { key: "front", name: "Front Squat", type: "bilateral", coeff: 0.70 },
  { key: "sidestep", name: "Side Step", type: "unilateral", coeff: 0.85 },
  { key: "sumo", name: "Sumo Squat", type: "bilateral", coeff: 0.70 }
];

let reps = 0;
let running = false;
let timer = 0;
let tInt = null;

let anchorReps = 0;
let anchorTime = 0;
let myoTarget = 0;
let totalReps = 0;
let totalTime = 0;
let myoLog = [];
let currentPhase = "anchor";

let buffer = [];
let lastState = "up";
let lastTime = 0;

let currentExerciseIndex = 0;

let unilateralMode = false;
let weakerSide = "left";
let activeSide = "both";
let sideStage = "first";
let sideResults = { left: null, right: null };
let mirroredPlan = null;

let anchorRestTimeout = null;
let myoRestTimeout = null;

let pendingSession = null;

const el = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", init);

function init() {
  loadProfileIntoForm();
  loadRotation();
  bindUI();
  renderHome();
}

function bindUI() {
  el("btnInfo").addEventListener("click", () => showScreen("screen-info"));
  el("btnProfile").addEventListener("click", () => {
    loadProfileIntoForm();
    showScreen("screen-profile");
  });
  el("btnHistory").addEventListener("click", showHistory);

  document.querySelectorAll("[data-back='home']").forEach(btn => {
    btn.addEventListener("click", renderHome);
  });

  el("btnSaveProfile").addEventListener("click", saveProfile);
  el("btnClearHistory").addEventListener("click", clearHistory);

  el("btnStartExercise").addEventListener("click", startSelectedExercise);

  el("btnStartAnchor").addEventListener("click", startAnchorSet);
  el("btnStopSet").addEventListener("click", stopSet);
  el("btnSaveSet").addEventListener("click", saveSet);
  el("btnStartMyo").addEventListener("click", startMyo);
  el("btnFinishSession").addEventListener("click", finishSession);

  el("btnSaveSessionChoice").addEventListener("click", commitPendingSession);
  el("btnDeleteSessionChoice").addEventListener("click", discardPendingSession);
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });
  el(id).classList.add("active");
}

function getProfile() {
  return JSON.parse(localStorage.getItem(PROFILE_KEY) || JSON.stringify({
    bodyweight: 70,
    sensitivity: "high"
  }));
}

function saveProfile() {
  const profile = {
    bodyweight: parseFloat(el("profileBodyweight").value || "70"),
    sensitivity: el("profileSensitivity").value
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  renderHome();
}

function loadProfileIntoForm() {
  const profile = getProfile();
  el("profileBodyweight").value = profile.bodyweight;
  el("profileSensitivity").value = profile.sensitivity;
}

function loadRotation() {
  currentExerciseIndex = parseInt(localStorage.getItem(ROTATION_KEY) || "0", 10);
  if (Number.isNaN(currentExerciseIndex) || currentExerciseIndex < 0 || currentExerciseIndex > 4) {
    currentExerciseIndex = 0;
  }
}

function saveRotation() {
  localStorage.setItem(ROTATION_KEY, String(currentExerciseIndex));
}

function getCurrentExercise() {
  return EXERCISES[currentExerciseIndex];
}

function renderHome() {
  loadRotation();
  renderPentagon();
  renderSelectedExercise();
  showScreen("screen-home");
}

function renderPentagon() {
  const svgGroup = el("pentagonPoints");
  if (!svgGroup) return;

  svgGroup.innerHTML = "";

  const positions = [
    { x: 160, y: 35, tx: 160, ty: 20 },
    { x: 275, y: 118, tx: 296, ty: 122 },
    { x: 230, y: 255, tx: 248, ty: 276 },
    { x: 90, y: 255, tx: 72, ty: 276 },
    { x: 45, y: 118, tx: 24, ty: 122 }
  ];

  EXERCISES.forEach((exercise, i) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "pentagon-point");
    g.addEventListener("click", () => {
      currentExerciseIndex = i;
      saveRotation();
      renderHome();
    });

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", positions[i].x);
    circle.setAttribute("cy", positions[i].y);
    circle.setAttribute("r", 16);

    let cls = "pentagon-dot";
    if (i === currentExerciseIndex) cls += " active";
    circle.setAttribute("class", cls);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", positions[i].tx);
    label.setAttribute("y", positions[i].ty);
    label.setAttribute("class", "pentagon-label");
    label.textContent = String(i + 1);

    g.appendChild(circle);
    g.appendChild(label);
    svgGroup.appendChild(g);
  });

  const currentExercise = getCurrentExercise();
  el("avgTrdsValue").textContent = getAverageTRDSForExercise(currentExercise.key).toFixed(2);
}

function renderSelectedExercise() {
  const exercise = getCurrentExercise();
  el("selectedExerciseName").textContent = exercise.name;
  el("selectedExerciseStatus").textContent =
    exercise.type === "unilateral" ? "Weaker side first" : "Ready to train";

  el("selectedExerciseImage").innerHTML = getExerciseArt(exercise.name);
  const last = getLastSessionForExercise(exercise.key);

  if (!last) {
    el("lastSessionSummary").textContent = "No sessions yet.";
    return;
  }

  if (exercise.type === "bilateral") {
    const myoPattern = last.myoSets?.length ? last.myoSets.map(set => set.reps).join(", ") : "none";
    el("lastSessionSummary").innerHTML = `
      Anchor: ${last.anchorReps} reps<br>
      Myo sets: ${last.myoSets.length}<br>
      Myo reps: ${myoPattern}<br>
      Total TRDS: ${last.TRDS}
    `;
  } else {
    el("lastSessionSummary").innerHTML = `
      ${renderSideSummary("Left", last.left)}<br>
      ${renderSideSummary("Right", last.right)}<br>
      Difference: ${last.diffPct || "0.00"}%<br>
      Total TRDS: ${last.TRDS}
    `;
  }
}

function renderSideSummary(label, side) {
  if (!side) return `${label}: no data`;
  const myoPattern = side.myoSets?.length ? side.myoSets.map(set => set.reps).join(", ") : "none";
  return `${label} — Anchor: ${side.anchorReps}, Myo: ${myoPattern}, TRDS: ${side.TRDS}`;
}

function startSelectedExercise() {
  const exercise = getCurrentExercise();
  const profile = getProfile();

  el("sessionExerciseName").textContent = exercise.name;
  el("sessionExerciseImage").innerHTML = getExerciseArt(exercise.name);
  el("sessionBodyweight").value = profile.bodyweight;
  el("sessionExternalWeight").value = 0;

  unilateralMode = exercise.type === "unilateral";
  el("weakerSideWrap").style.display = unilateralMode ? "grid" : "none";

  weakerSide = unilateralMode ? el("weakerSide").value : "both";
  activeSide = weakerSide;

  el("sessionSupportText").textContent =
    unilateralMode ? `Unilateral session (${activeSide.toUpperCase()} first)` : "Bilateral session";

  resetSessionState();
  showScreen("screen-session");
}

function clearPhaseTimeouts() {
  if (anchorRestTimeout) {
    clearTimeout(anchorRestTimeout);
    anchorRestTimeout = null;
  }
  if (myoRestTimeout) {
    clearTimeout(myoRestTimeout);
    myoRestTimeout = null;
  }
}

function resetSessionState() {
  clearPhaseTimeouts();

  reps = 0;
  running = false;
  timer = 0;
  anchorReps = 0;
  anchorTime = 0;
  myoTarget = 0;
  totalReps = 0;
  totalTime = 0;
  myoLog = [];
  currentPhase = "anchor";
  buffer = [];
  lastState = "up";
  lastTime = 0;
  clearInterval(tInt);

  sideStage = "first";
  mirroredPlan = null;
  sideResults = { left: null, right: null };
  weakerSide = unilateralMode ? el("weakerSide").value : "both";
  activeSide = weakerSide;

  pendingSession = null;

  el("phase").innerText = unilateralMode ? `READY (${activeSide.toUpperCase()})` : "READY";
  el("reps").innerText = "0";
  el("time").innerText = "0";
  el("target").innerText = "-";

  updateButtons("pre-anchor");
}

function updateButtons(state) {
  el("btnStartAnchor").style.display = "none";
  el("btnStartMyo").style.display = "none";
  el("btnStopSet").style.display = "none";
  el("btnSaveSet").style.display = "none";
  el("btnFinishSession").style.display = "block";

  if (state === "pre-anchor") {
    el("btnStartAnchor").style.display = "block";
  }

  if (state === "anchor-running") {
    el("btnStopSet").style.display = "block";
    el("btnSaveSet").style.display = "block";
  }

  if (state === "myo-ready") {
    el("btnStartMyo").style.display = "block";
  }

  if (state === "myo-running") {
    el("btnStopSet").style.display = "block";
    el("btnSaveSet").style.display = "block";
  }
}

function resetSetReadout() {
  reps = 0;
  timer = 0;
  buffer = [];
  lastState = "up";
  lastTime = 0;
  el("reps").innerText = "0";
  el("time").innerText = "0";
}

function startAnchorSet() {
  if (running) return;

  if (unilateralMode) {
    weakerSide = el("weakerSide").value;
    if (sideStage === "first") {
      activeSide = weakerSide;
    }
  }

  resetSetReadout();
  running = true;
  currentPhase = "anchor";

  const phaseLabel = unilateralMode
    ? `ANCHOR (${activeSide.toUpperCase()})`
    : "ANCHOR";

  el("phase").innerText = phaseLabel;
  el("target").innerText = unilateralMode && sideStage === "second" && mirroredPlan
    ? String(mirroredPlan.anchorReps)
    : "-";

  updateButtons("anchor-running");

  tInt = setInterval(() => {
    timer++;
    el("time").innerText = String(timer);
  }, 1000);

  window.addEventListener("devicemotion", detect);
}

function stopSet() {
  running = false;
  clearInterval(tInt);
  window.removeEventListener("devicemotion", detect);

  if (currentPhase === "anchor" || currentPhase === "myo") {
    el("btnStopSet").style.display = "block";
    el("btnSaveSet").style.display = "block";
    el("btnStartAnchor").style.display = "none";
    el("btnStartMyo").style.display = "none";
  }
}

function saveSet() {
  const profileBodyweight = parseFloat(el("sessionBodyweight").value || "70");
  const externalWeight = parseFloat(el("sessionExternalWeight").value || "0");
  const exercise = getCurrentExercise();
  const load = externalWeight + (profileBodyweight * exercise.coeff);

  if (currentPhase === "anchor") {
    if (reps <= 0) {
      el("phase").innerText = "NO REPS";
      return;
    }

    if (unilateralMode && sideStage === "second" && mirroredPlan) {
      if (reps !== mirroredPlan.anchorReps) {
        el("phase").innerText = `MATCH ${mirroredPlan.anchorReps} REPS`;
        return;
      }
    }

    anchorReps = reps;
    anchorTime = timer;

    totalReps += reps;
    totalTime += timer;

    myoTarget = Math.max(1, Math.round(anchorReps * 0.2));
    currentPhase = "myo";

    el("phase").innerText = unilateralMode
      ? `ANCHOR REST (${activeSide.toUpperCase()})`
      : "ANCHOR REST";
    el("target").innerText = String(myoTarget);

    updateButtons("anchor-rest");
    clearPhaseTimeouts();

    anchorRestTimeout = setTimeout(() => {
      el("phase").innerText = unilateralMode
        ? `READY FOR MYO (${activeSide.toUpperCase()})`
        : "READY FOR MYO";
      updateButtons("myo-ready");
      anchorRestTimeout = null;
    }, anchorTime * 1000);

    resetSetReadout();
    return;
  }

  if (currentPhase === "myo") {
    if (reps <= 0) {
      el("phase").innerText = "NO REPS";
      return;
    }

    let expectedTarget = myoTarget;

    if (unilateralMode && sideStage === "second" && mirroredPlan) {
      const expected = mirroredPlan.myoSets[myoLog.length]?.reps;
      if (typeof expected === "number") {
        expectedTarget = expected;
      }

      if (reps !== expectedTarget) {
        el("phase").innerText = `MATCH ${expectedTarget} REPS`;
        return;
      }
    }

    const savedReps = reps;
    const savedTime = timer;

    const myoMLS = load * savedReps;
    const myoTRDS = myoMLS / Math.max(1, savedTime);

    myoLog.push({
      reps: savedReps,
      time: savedTime,
      TRDS: myoTRDS.toFixed(2)
    });

    totalReps += savedReps;
    totalTime += savedTime;

    el("phase").innerText = unilateralMode
      ? `MYO REST (${activeSide.toUpperCase()})`
      : "MYO REST";

    updateButtons("myo-rest");
    clearPhaseTimeouts();

    myoRestTimeout = setTimeout(() => {
      el("phase").innerText = unilateralMode
        ? `READY FOR NEXT MYO (${activeSide.toUpperCase()})`
        : "READY FOR NEXT MYO";
      updateButtons("myo-ready");
      myoRestTimeout = null;
    }, 10000);

    resetSetReadout();
  }
}

function startMyo() {
  if (currentPhase !== "myo") {
    el("phase").innerText = "COMPLETE ANCHOR FIRST";
    return;
  }

  if (running) return;

  resetSetReadout();
  running = true;

  let target = myoTarget;

  if (unilateralMode && sideStage === "second" && mirroredPlan) {
    const matchedSet = mirroredPlan.myoSets[myoLog.length];
    if (!matchedSet) {
      el("phase").innerText = "NO MORE MYO SETS";
      return;
    }
    target = matchedSet.reps;
  }

  el("phase").innerText = unilateralMode
    ? `MYO (${activeSide.toUpperCase()})`
    : "MYO";
  el("target").innerText = String(target);

  updateButtons("myo-running");

  tInt = setInterval(() => {
    timer++;
    el("time").innerText = String(timer);
  }, 1000);

  window.addEventListener("devicemotion", detect);
}

function finishSession() {
  stopSet();

  const profileBodyweight = parseFloat(el("sessionBodyweight").value || "70");
  const externalWeight = parseFloat(el("sessionExternalWeight").value || "0");
  const exercise = getCurrentExercise();

  const profile = getProfile();
  profile.bodyweight = profileBodyweight;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));

  if (!unilateralMode) {
    const load = externalWeight + (profileBodyweight * exercise.coeff);
    const MLS = load * totalReps;
    const TRDS = MLS / Math.max(1, totalTime);
    const anchorTRDS = ((load * anchorReps) / Math.max(1, anchorTime)).toFixed(2);

    pendingSession = {
      exerciseKey: exercise.key,
      exerciseName: exercise.name,
      date: new Date().toLocaleString(),
      bodyweight: profileBodyweight,
      externalWeight,
      anchorReps,
      anchorTime,
      anchorTRDS,
      myoSets: myoLog.slice(),
      totalReps,
      totalTime,
      MLS: MLS.toFixed(1),
      TRDS: TRDS.toFixed(2)
    };

    showSummary();
    return;
  }

  const sideData = buildSideResult(profileBodyweight, externalWeight, exercise);
  sideResults[activeSide] = sideData;

  if (sideStage === "first") {
    clearPhaseTimeouts();

    mirroredPlan = {
      anchorReps: sideData.anchorReps,
      myoSets: sideData.myoSets.map(set => ({ reps: set.reps }))
    };

    activeSide = weakerSide === "left" ? "right" : "left";
    sideStage = "second";

    reps = 0;
    running = false;
    timer = 0;
    anchorReps = 0;
    anchorTime = 0;
    myoTarget = Math.max(1, Math.round(mirroredPlan.anchorReps * 0.2));
    totalReps = 0;
    totalTime = 0;
    myoLog = [];
    currentPhase = "anchor";
    buffer = [];
    lastState = "up";
    lastTime = 0;
    clearInterval(tInt);

    el("phase").innerText = `SWITCH TO ${activeSide.toUpperCase()}`;
    el("reps").innerText = "0";
    el("time").innerText = "0";
    el("target").innerText = String(mirroredPlan.anchorReps);

    updateButtons("pre-anchor");
    return;
  }

  const left = sideResults.left;
  const right = sideResults.right;

  const totalCombinedTRDS = (
    (parseFloat(left.TRDS) + parseFloat(right.TRDS)) / 2
  ).toFixed(2);

  const diffPct = percentDifference(parseFloat(left.TRDS), parseFloat(right.TRDS)).toFixed(2);

  pendingSession = {
    exerciseKey: exercise.key,
    exerciseName: exercise.name,
    date: new Date().toLocaleString(),
    bodyweight: profileBodyweight,
    externalWeight,
    weakerSide,
    left,
    right,
    TRDS: totalCombinedTRDS,
    diffPct
  };

  showSummary();
}

function buildSideResult(bodyweight, externalWeight, exercise) {
  const load = externalWeight + (bodyweight * exercise.coeff);
  const MLS = load * totalReps;
  const TRDS = MLS / Math.max(1, totalTime);
  const anchorTRDS = ((load * anchorReps) / Math.max(1, anchorTime)).toFixed(2);

  return {
    anchorReps,
    anchorTime,
    anchorTRDS,
    myoSets: myoLog.slice(),
    totalReps,
    totalTime,
    MLS: MLS.toFixed(1),
    TRDS: TRDS.toFixed(2)
  };
}

function showSummary() {
  if (!pendingSession) return;

  const s = pendingSession;
  let html = `<div class="summary-section"><div class="summary-heading">${s.exerciseName}</div>${s.date}</div>`;

  if (s.left && s.right) {
    html += `
      <div class="summary-section">
        <strong>Left</strong><br>
        Anchor: ${s.left.anchorReps} reps (${s.left.anchorTime}s) | TRDS: ${s.left.anchorTRDS}<br>
        ${renderMyoHistory(s.left.myoSets)}
      </div>
      <div class="summary-section">
        <strong>Right</strong><br>
        Anchor: ${s.right.anchorReps} reps (${s.right.anchorTime}s) | TRDS: ${s.right.anchorTRDS}<br>
        ${renderMyoHistory(s.right.myoSets)}
      </div>
      <div class="summary-section">
        <div class="symmetry-label">Balance</div>
        ${renderSymmetryBar(parseFloat(s.left.TRDS), parseFloat(s.right.TRDS))}
        Total TRDS: ${s.TRDS}<br>
        Difference: ${s.diffPct}%
      </div>
    `;
  } else {
    html += `
      <div class="summary-section">
        Anchor: ${s.anchorReps} reps (${s.anchorTime}s) | TRDS: ${s.anchorTRDS}<br><br>
        ${renderMyoHistory(s.myoSets)}<br><br>
        Total Reps: ${s.totalReps}<br>
        Total TRDS: ${s.TRDS}
      </div>
    `;
  }

  el("summaryContent").innerHTML = html;
  showScreen("screen-summary");
}

function commitPendingSession() {
  if (!pendingSession) {
    renderHome();
    return;
  }

  saveHistorySession(pendingSession);
  pendingSession = null;

  currentExerciseIndex = (currentExerciseIndex + 1) % EXERCISES.length;
  saveRotation();

  renderHome();
}

function discardPendingSession() {
  pendingSession = null;
  renderHome();
}

function saveHistorySession(session) {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  history.unshift(session);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function showHistory() {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  const list = el("historyList");

  if (!history.length) {
    list.innerHTML = `<div class="history-card">No history yet.</div>`;
    showScreen("screen-history");
    return;
  }

  list.innerHTML = history.map((h, idx) => {
    const previousAvg = getAverageTRDSForExercise(h.exerciseKey, idx + 1).toFixed(2);

    if (h.left && h.right) {
      return `
        <div class="history-card">
          <div class="history-title">${h.exerciseName}</div>
          <div class="history-sub">${h.date}</div>

          <strong>Left</strong><br>
          Anchor: ${h.left.anchorReps} reps (${h.left.anchorTime}s) | TRDS: ${h.left.anchorTRDS}<br>
          ${renderMyoHistory(h.left.myoSets)}<br><br>

          <strong>Right</strong><br>
          Anchor: ${h.right.anchorReps} reps (${h.right.anchorTime}s) | TRDS: ${h.right.anchorTRDS}<br>
          ${renderMyoHistory(h.right.myoSets)}<br>

          <div class="symmetry-wrap">
            <div class="symmetry-label">Balance</div>
            ${renderSymmetryBar(parseFloat(h.left.TRDS), parseFloat(h.right.TRDS))}
          </div>

          Total TRDS: ${h.TRDS} (${previousAvg})<br>
          Difference: ${h.diffPct}%
        </div>
      `;
    }

    return `
      <div class="history-card">
        <div class="history-title">${h.exerciseName}</div>
        <div class="history-sub">${h.date}</div>
        Anchor: ${h.anchorReps} reps (${h.anchorTime}s) | TRDS: ${h.anchorTRDS}<br><br>
        ${renderMyoHistory(h.myoSets)}<br><br>
        Total Reps: ${h.totalReps}<br>
        TRDS: ${h.TRDS} (${previousAvg})
      </div>
    `;
  }).join("");

  showScreen("screen-history");
}

function renderMyoHistory(myoSets) {
  if (!myoSets || !myoSets.length) return "No Myo sets logged";
  return myoSets.map((set, i) =>
    `Myo ${i + 1}: ${set.reps} reps (${set.time}s) | TRDS: ${set.TRDS}`
  ).join("<br>");
}

function renderSymmetryBar(leftVal, rightVal) {
  const total = leftVal + rightVal || 1;
  const leftPct = (leftVal / total) * 100;
  const rightPct = 100 - leftPct;

  return `
    <div class="symmetry-bar">
      <div class="symmetry-left" style="width:${leftPct}%"></div>
      <div class="symmetry-right" style="width:${rightPct}%"></div>
      <div class="symmetry-mid"></div>
    </div>
    <div class="symmetry-values">L ${leftVal.toFixed(2)} | R ${rightVal.toFixed(2)}</div>
  `;
}

function percentDifference(a, b) {
  const avg = (a + b) / 2 || 1;
  return Math.abs(a - b) / avg * 100;
}

function clearHistory() {
  if (!confirm("Clear all history?")) return;
  localStorage.removeItem(HISTORY_KEY);
  showHistory();
}

function getAverageTRDSForExercise(exerciseKey, limit = null) {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  const filtered = history
    .slice(0, limit || history.length)
    .filter(item => item.exerciseKey === exerciseKey);

  if (!filtered.length) return 0;
  const sum = filtered.reduce((acc, item) => acc + parseFloat(item.TRDS), 0);
  return sum / filtered.length;
}

function getLastSessionForExercise(exerciseKey) {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  return history.find(item => item.exerciseKey === exerciseKey) || null;
}

function getSensitivityThresholds() {
  const profile = getProfile();
  const sensitivity = profile.sensitivity || "high";

  if (sensitivity === "low") {
    return { down: 9.3, up: 11.7, debounce: 550 };
  }
  if (sensitivity === "medium") {
    return { down: 9.4, up: 11.6, debounce: 525 };
  }
  return { down: 9.5, up: 11.5, debounce: 500 };
}

function detect(e) {
  if (!running) return;

  const acc = e.accelerationIncludingGravity || { x: 0, y: 0, z: 0 };
  const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);

  buffer.push(mag);
  if (buffer.length > 5) buffer.shift();

  const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length;
  const thresholds = getSensitivityThresholds();

  if (avg < thresholds.down && lastState === "up") {
    lastState = "down";
  }

  if (avg > thresholds.up && lastState === "down") {
    const now = Date.now();
    if (now - lastTime > thresholds.debounce) {
      reps++;
      el("reps").innerText = String(reps);
      lastTime = now;

      if (currentPhase === "myo") {
        const target = unilateralMode && sideStage === "second" && mirroredPlan
          ? (mirroredPlan.myoSets[myoLog.length]?.reps ?? myoTarget)
          : myoTarget;

        if (reps >= target) {
          stopSet();
        }
      }

      if (currentPhase === "anchor" && unilateralMode && sideStage === "second" && mirroredPlan) {
        if (reps >= mirroredPlan.anchorReps) {
          stopSet();
        }
      }
    }
    lastState = "up";
  }
}

function getExerciseArt(name) {
  return `<div>${name}</div>`;
}
