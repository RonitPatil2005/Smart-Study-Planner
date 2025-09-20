
/* ----------------- DOM refs ----------------- */
const subjectInput = document.getElementById("subject");
const timeInput = document.getElementById("time");
const goalInput = document.getElementById("goal");
const addBtn = document.getElementById("add-btn");
const entriesContainer = document.getElementById("entries");
const downloadBtn = document.getElementById("download-pdf");
const notifySound = document.getElementById("notify-sound");
const startTimeInput = document.getElementById("start-time");
const durationInput = document.getElementById("duration");
const generateSlotBtn = document.getElementById("generate-slot");
const dateInput = document.getElementById("date-input"); // new

let entries = [];
let currentDay = "Monday";

/* ------------- notification permission & sound unlock ------------- */
async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch (e) { console.warn(e); }
  }
}
requestNotificationPermission();

let soundUnlocked = false;
document.addEventListener("click", () => {
  if (!soundUnlocked && notifySound) {
    notifySound.play()
      .then(() => { notifySound.pause(); notifySound.currentTime = 0; soundUnlocked = true; })
      .catch(() => { });
  }
}, { once: true });

/* ---------------- non-blocking showReminder (sound first) ---------------- */
function showReminder(title, message) {
  if (notifySound) {
    notifySound.currentTime = 0;
    notifySound.play().catch(err => console.log("Sound play failed:", err));
  }

  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body: message }); return; }
    catch (e) { console.warn("Notification error:", e); }
  }
  createPopup(title, message);
}

/* --- popup creation (stacked container) --- */
function createPopup(title, message, autoCloseMs = 5000) {
  let container = document.getElementById("reminder-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "reminder-container";
    container.className = "reminder-container";
    document.body.appendChild(container);
  }

  const popup = document.createElement("div");
  popup.className = "reminder-popup";
  popup.innerHTML = `
    <div class="reminder-body">
      <strong style="display:block; margin-bottom:6px;">${escapeHtml(title)}</strong>
      <div>${escapeHtml(message)}</div>
    </div>
    <button class="reminder-close" aria-label="Close reminder">&times;</button>
  `;
  popup.querySelector(".reminder-close").addEventListener("click", () => popup.remove());
  container.appendChild(popup);

  if (autoCloseMs > 0) setTimeout(() => popup.remove(), autoCloseMs);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------- time parsing helpers ---------------- */
function parseTimeString(timeStr) {
  if (!timeStr) return new Date();
  const s = timeStr.trim().toUpperCase();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!m) {
    // fallback for "HH:MM" 24-hour
    const parts = (timeStr || "").split(":").map(Number);
    const d = new Date();
    if (parts.length >= 2 && !Number.isNaN(parts[0])) {
      d.setHours(parts[0], parts[1], 0, 0);
      return d;
    }
    return new Date();
  }
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const mod = m[3];
  if (mod) {
    if (mod === "PM" && hours < 12) hours += 12;
    if (mod === "AM" && hours === 12) hours = 0;
  }
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function combineDateWithTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, mm, dd] = dateStr.split("-").map(Number);
  const mTime = String(timeStr || "").trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  let hours = 0, minutes = 0;
  if (mTime) {
    hours = parseInt(mTime[1], 10);
    minutes = parseInt(mTime[2], 10);
    const mod = mTime[3];
    if (mod === "PM" && hours < 12) hours += 12;
    if (mod === "AM" && hours === 12) hours = 0;
  } else {
    const parts = (timeStr || "").split(":").map(Number);
    if (parts.length >= 2 && !Number.isNaN(parts[0])) { hours = parts[0]; minutes = parts[1] || 0; }
  }
  return new Date(y, mm - 1, dd, hours, minutes, 0, 0);
}

/* get next date for weekday (same as before) */
function getNextDateForDay(dayName, timeDate) {
  const map = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const targetDow = map[dayName];
  if (targetDow === undefined) return timeDate;
  const today = new Date();
  const todayDow = today.getDay();
  let daysUntil = (targetDow - todayDow + 7) % 7;
  const candidate = new Date(today);
  candidate.setDate(today.getDate() + daysUntil);
  candidate.setHours(timeDate.getHours(), timeDate.getMinutes(), 0, 0);
  if (candidate < new Date() && daysUntil !== 0) candidate.setDate(candidate.getDate() + 7);
  return candidate;
}

/* ------------- new: schedule for entry (date OR weekday) ------------- */
function scheduleReminderForEntry(entry) {
  const [startStr, endStr] = String(entry.time).split("║").map(s => s.trim());
  let startDate = parseTimeString(startStr);
  let endDate = parseTimeString(endStr);
  const now = new Date();

  if (entry.date) {
    const realStart = combineDateWithTime(entry.date, startStr);
    const durationMs = endDate.getTime() - startDate.getTime();
    const realEnd = new Date(realStart.getTime() + durationMs);
    startDate = realStart;
    endDate = realEnd;
  } else if (entry.day) {
    const durationMs = endDate.getTime() - startDate.getTime();
    startDate = getNextDateForDay(entry.day, startDate);
    endDate = new Date(startDate.getTime() + durationMs);
  }

  const reminderStart = new Date(startDate.getTime() - 2 * 60000);
  const diffStart = reminderStart - now;
  const diffEnd = endDate - now;

  if (diffStart > 0) {
    setTimeout(() => showReminder("Upcoming Task", `📘 ${entry.subject} — "${entry.goal}" starts in 2 minutes!`), diffStart);
  } else if (diffEnd > 0) {
    showReminder("Ongoing Task", `📘 ${entry.subject} — "${entry.goal}" is already started.`);
  } else {
    showReminder("Task already ended", `✅ ${entry.subject} — "${entry.goal}" already ended.`);
  }

  if (diffEnd > 0) {
    setTimeout(() => showReminder("Task Completed", `✅ ${entry.subject} — "${entry.goal}" has ended.`), diffEnd);
  }
}

/* ----------------- UI handlers ----------------- */
const dayButtons = document.querySelectorAll(".day-btn");
dayButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    dayButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentDay = btn.dataset.day;
    renderEntries();
  });
});

addBtn.addEventListener("click", () => {
  const subject = subjectInput.value.trim();
  const time = timeInput.value.trim();
  const goal = goalInput.value.trim();
  const dateVal = dateInput.value || null;

  if (!subject || !time || !goal) {
    alert("Please fill in all fields!");
    return;
  }

  const entry = { subject, time, goal, day: currentDay, date: dateVal, completed: false };
  entries.push(entry);
  scheduleReminderForEntry(entry);
  renderEntries();

  subjectInput.value = "";
  timeInput.value = "";
  goalInput.value = "";
  dateInput.value = "";
});

function renderEntries() {
  entriesContainer.innerHTML = "";
  entries.forEach((entry, index) => {
    // Show only entries for currentDay OR date-based entries (choose your desired logic)
    if (!entry.date && entry.day !== currentDay) return;
    // if you prefer to always show date-based entries regardless of currentDay, remove above check

    const dateHtml = entry.date ? `<p><strong>Date:</strong> ${formatDateDisplay(entry.date)}</p>` : "";
    const card = document.createElement("div");
    card.className = "entry-card";
    card.innerHTML = `
      <label class="checkbox-label">
        <input type="checkbox" class="task-check" data-index="${index}" ${entry.completed ? 'checked' : ''}>
        <div class="entry-content ${entry.completed ? 'completed' : ''}">
          <h3>${escapeHtml(entry.subject)}</h3>
          <p><strong>Time:</strong> ${escapeHtml(entry.time)}</p>
          ${dateHtml}
          <p><strong>Goal:</strong> ${escapeHtml(entry.goal)}</p>
        </div>
      </label>
    `;
    entriesContainer.appendChild(card);
  });

  document.querySelectorAll(".task-check").forEach(cb => {
    cb.addEventListener("change", () => {
      const idx = parseInt(cb.dataset.index);
      entries[idx].completed = cb.checked;
      renderEntries();
    });
  });
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

/* ----------------- time slot generator (same as before) ----------------- */
generateSlotBtn.addEventListener("click", () => {
  const startTime = startTimeInput.value;
  const duration = parseInt(durationInput.value, 10);
  if (!startTime || isNaN(duration)) {
    alert("Please select both a start time and duration.");
    return;
  }
  const [hours, minutes] = startTime.split(":").map(Number);
  const startDate = new Date();
  startDate.setHours(hours, minutes, 0, 0);
  const endDate = new Date(startDate.getTime() + duration * 60000);
  const formatTime = (date) => date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
  const timeSlot = `${formatTime(startDate)} ║ ${formatTime(endDate)}`;
  timeInput.value = timeSlot;
});

/* ----------------- PDF export (same as before) ----------------- */
downloadBtn.addEventListener("click", () => {
  const groupedEntries = groupedEntriesByDay();
  let content = `<div style="padding:1rem;font-family:Segoe UI, sans-serif;"><h1 style="text-align:center;color:#7b4ca0;">Weekly Study Timetable</h1>`;
  for (const day of Object.keys(groupedEntries)) {
    content += `<h2 style="color:#5f3d90;margin-top:1rem;">${day}</h2>`;
    const dayEntries = groupedEntries[day];
    if (dayEntries.length === 0) content += `<p>No entries.</p>`;
    else dayEntries.forEach(entry => {
      content += `<div style="background:#f8f1fa;padding:10px;margin:8px 0;border-left:4px solid #a074c4;border-radius:8px;">
        <strong>Subject:</strong> ${escapeHtml(entry.subject)}<br/>
        <strong>Time:</strong> ${escapeHtml(entry.time)}<br/>
        ${entry.date ? `<strong>Date:</strong> ${escapeHtml(formatDateDisplay(entry.date))}<br/>` : ""}
        <strong>Goal:</strong> ${escapeHtml(entry.goal)}<br/>
      </div>`;
    });
  }
  content += `</div>`;
  const opt = {
    margin: 0.5,
    filename: 'Weekly_Timetable.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
  };
  html2pdf().from(content).set(opt).save();
});

function groupedEntriesByDay() {
  const grouped = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [] };
  entries.forEach(e => grouped[e.day].push(e));
  return grouped;
}
