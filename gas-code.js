/**
 * 주말 근무 관리 시스템 - 통합 로딩 최적화 버전
 */

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  var action = e.parameter.action;
  var result;
  try {
    var data = e.parameter.data ? JSON.parse(e.parameter.data) : null;
    switch (action) {
      case 'getAllData': result = getAllData(); break; // 통합 호출 추가
      case 'getSettings': result = getSettings(); break;
      case 'getEmployees': result = getEmployees(); break;
      case 'saveSettings': result = saveSettings(data); break;
      case 'saveApplication': result = saveApplication(data); break;
      case 'saveAssignments': result = saveAssignments(data); break;
      case 'saveHistory': result = saveHistory(data); break;
      case 'clearApplications': result = clearSheet('신청현황'); break;
      case 'clearAssignments': result = clearSheet('배치결과'); break;
      default: result = { error: '알 수 없는 액션: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// [핵심] 모든 데이터를 한 번에 묶어서 반환
function getAllData() {
  return {
    settings: getSettings(),
    employees: getEmployees(),
    applications: getApplications(),
    assignments: getAssignments(),
    history: getHistory()
  };
}

function getSettings() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정');
  var data = sheet.getRange('A2:C2').getValues()[0];
  return { year: data[0], month: data[1], status: data[2] || 'closed' };
}

function getEmployees() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('직원명단');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => r[0]).filter(Boolean);
}

function getApplications() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('신청현황');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 2).getValues().filter(r => r[0] && r[1]).map(r => ({ name: r[0], date: r[1] }));
}

function getAssignments() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배치결과');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 3).getValues().filter(r => r[0]).map(r => ({ date: r[0], name: r[1], tag: r[2] }));
}

function getHistory() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('근무이력');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 4).getValues().filter(r => r[0]).map(r => ({ name: r[0], satCount: r[1]||0, sunCount: r[2]||0, totalCount: r[3]||0 }));
}

function saveApplication(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('신청현황');
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var range = sheet.getRange(2, 1, lastRow - 1, 2);
    var filtered = range.getValues().filter(row => row[0] !== data.name && row[0] !== "");
    range.clearContent();
    if (filtered.length > 0) sheet.getRange(2, 1, filtered.length, 2).setValues(filtered);
  }
  if (data.dates && data.dates.length > 0) {
    var rows = data.dates.map(d => [data.name, d]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 2).setValues(rows);
  }
  return { success: true };
}

function saveSettings(data) {
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('A2:C2').setValues([[data.year, data.month, data.status]]);
  return { success: true };
}

function saveAssignments(data) {
  clearSheet('배치결과');
  if (data && data.length > 0) {
    var rows = data.map(a => [a.date, a.name, a.tag]);
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배치결과').getRange(2, 1, rows.length, 3).setValues(rows);
  }
  return { success: true };
}

function saveHistory(data) {
  clearSheet('근무이력');
  if (data && data.length > 0) {
    var rows = data.map(h => [h.name, h.satCount, h.sunCount, h.totalCount]);
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName('근무이력').getRange(2, 1, rows.length, 4).setValues(rows);
  }
  return { success: true };
}

function clearSheet(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  return { success: true };
}
