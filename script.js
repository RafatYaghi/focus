// ════════════════════════════════════════════════════════════
// MY FOCUS BOARD — Google Apps Script Backend
// ════════════════════════════════════════════════════════════
//
// SETUP INSTRUCTIONS (takes about 5 minutes):
//
// 1. Go to https://script.google.com → New Project
// 2. Delete any existing code and paste ALL of this file in
// 3. Click "Deploy" → "New deployment"
// 4. Type: Web app
// 5. Execute as: Me
// 6. Who has access: Anyone
// 7. Click Deploy → Authorise (allow Google permissions)
// 8. Copy the Web App URL
// 9. Paste that URL into your Focus Board setup screen
//
// That's it! Every time you click "Sync to Sheets" on your
// board, your data will appear in a Google Spreadsheet.
// ════════════════════════════════════════════════════════════

const SHEET_NAME = "FocusBoard";

// Called when the board sends data (POST request)
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    writeToSheet(data);
    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Called when the board loads (GET request) — returns saved data
function doGet(e) {
  try {
    const ss = getOrCreateSpreadsheet();
    const sheet = getOrCreateSheet(ss, SHEET_NAME);
    const data = readFromSheet(sheet);
    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok", data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function writeToSheet(data) {
  const ss = getOrCreateSpreadsheet();

  // ── GOALS SHEET ──
  writeGoals(ss, data.goals || []);

  // ── TASKS SHEET ──
  writeTasks(ss, data.tasks || {});

  // ── HABITS SHEET ──
  writeHabits(ss, data.habits || []);

  // ── SUMMARY SHEET ──
  writeSummary(ss, data);
}

function writeGoals(ss, goals) {
  const sheet = getOrCreateSheet(ss, "📋 Goals");
  sheet.clearContents();

  // Header row
  const headers = ["ID", "Category", "Title", "Description", "Progress %", "Status"];
  styleHeader(sheet, headers);

  const rows = goals.map(g => [
    g.id,
    g.cat === "work" ? "💼 Work" : g.cat === "goal" ? "🌱 Personal" : "🔁 Habit",
    g.title,
    g.desc || "",
    g.progress || 0,
    (g.progress || 0) >= 100 ? "✅ Done" : (g.progress || 0) > 0 ? "🔄 In Progress" : "⏳ Not Started"
  ]);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  // Progress bar formatting
  const progressCol = sheet.getRange(2, 5, Math.max(rows.length, 1), 1);
  progressCol.setNumberFormat("0\"%\"");

  autoFitColumns(sheet);
}

function writeTasks(ss, tasks) {
  const sheet = getOrCreateSheet(ss, "✅ Tasks");
  sheet.clearContents();

  const headers = ["Category", "Task", "Status", "Added"];
  styleHeader(sheet, headers);

  const allTasks = [];
  const cats = { work: "💼 Work", goal: "🌱 Personal" };

  Object.entries(cats).forEach(([key, label]) => {
    (tasks[key] || []).forEach(t => {
      allTasks.push([
        label,
        t.text,
        t.done ? "✅ Done" : "⏳ To Do",
        new Date().toLocaleDateString("en-GB")
      ]);
    });
  });

  if (allTasks.length > 0) {
    sheet.getRange(2, 1, allTasks.length, headers.length).setValues(allTasks);
  }

  autoFitColumns(sheet);
}

function writeHabits(ss, habits) {
  const sheet = getOrCreateSheet(ss, "🔁 Habits");
  sheet.clearContents();

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const headers = ["Habit", ...dayLabels, "Streak", "Completion %"];
  styleHeader(sheet, headers);

  const rows = habits.map(h => {
    const days = h.days || [0,0,0,0,0,0,0];
    const streak = calcStreak(days);
    const completion = Math.round((days.filter(d => d).length / 7) * 100);
    return [
      h.name,
      ...days.map(d => d ? "✅" : "○"),
      streak + " days",
      completion + "%"
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  autoFitColumns(sheet);
}

function writeSummary(ss, data) {
  const sheet = getOrCreateSheet(ss, "📊 Summary");
  sheet.clearContents();

  const goals = data.goals || [];
  const habits = data.habits || [];
  const tasks = data.tasks || {};
  const allTasks = [...(tasks.work || []), ...(tasks.goal || [])];

  const totalGoals = goals.length;
  const completedGoals = goals.filter(g => (g.progress || 0) >= 100).length;
  const avgProgress = totalGoals > 0
    ? Math.round(goals.reduce((sum, g) => sum + (g.progress || 0), 0) / totalGoals)
    : 0;
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter(t => t.done).length;

  const summaryData = [
    ["📊 FOCUS BOARD SUMMARY", ""],
    ["Last synced", new Date().toLocaleString("en-GB")],
    ["Month focus", data.monthFocus || "(not set)"],
    ["", ""],
    ["🎯 GOALS", ""],
    ["Total goals", totalGoals],
    ["Completed goals", completedGoals],
    ["Average progress", avgProgress + "%"],
    ["", ""],
    ["✅ TASKS", ""],
    ["Total tasks", totalTasks],
    ["Completed tasks", doneTasks],
    ["Completion rate", totalTasks > 0 ? Math.round((doneTasks/totalTasks)*100) + "%" : "—"],
    ["", ""],
    ["🔁 HABITS", ""],
    ["Habits tracked", habits.length],
  ];

  sheet.getRange(1, 1, summaryData.length, 2).setValues(summaryData);

  // Style title
  sheet.getRange(1, 1).setFontSize(14).setFontWeight("bold");
  sheet.getRange(5, 1).setFontWeight("bold");
  sheet.getRange(10, 1).setFontWeight("bold");
  sheet.getRange(15, 1).setFontWeight("bold");

  autoFitColumns(sheet);
}

// ── HELPERS ──

function getOrCreateSpreadsheet() {
  // Try to find an existing spreadsheet named "My Focus Board"
  const files = DriveApp.getFilesByName("My Focus Board");
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  // Create a new one
  const ss = SpreadsheetApp.create("My Focus Board");
  return ss;
}

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function styleHeader(sheet, headers) {
  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range.setFontWeight("bold");
  range.setBackground("#f5f2ed");
  range.setFontColor("#2a2520");
  range.setBorder(false, false, true, false, false, false, "#c8845a", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

function autoFitColumns(sheet) {
  try { sheet.autoResizeColumns(1, 10); } catch(e) {}
}

function calcStreak(days) {
  let s = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i]) s++; else break;
  }
  return s;
}

function readFromSheet(sheet) {
  // Placeholder — full read-back can be implemented if needed
  return {};
}
