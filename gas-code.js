// ============================================================
// 이 코드를 Google Apps Script 편집기에 붙여넣으세요.
// (스프레드시트 > 확장 프로그램 > Apps Script)
// ============================================================

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var action = e.parameter.action;
  var result;

  try {
    switch (action) {
      case 'getSettings':
        result = getSettings();
        break;
      case 'getEmployees':
        result = getEmployees();
        break;
      case 'getApplications':
        result = getApplications();
        break;
      case 'getAssignments':
        result = getAssignments();
        break;
      case 'getHistory':
        result = getHistory();
        break;
      case 'saveSettings':
        result = saveSettings(JSON.parse(e.parameter.data));
        break;
      case 'saveApplication':
        result = saveApplication(JSON.parse(e.parameter.data));
        break;
      case 'saveAssignments':
        result = saveAssignments(JSON.parse(e.parameter.data));
        break;
      case 'saveHistory':
        result = saveHistory(JSON.parse(e.parameter.data));
        break;
      case 'clearApplications':
        result = clearSheet('신청현황');
        break;
      case 'clearAssignments':
        result = clearSheet('배치결과');
        break;
      default:
        result = { error: '알 수 없는 액션: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ----- 읽기 -----
function getSettings() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정');
  var data = sheet.getRange('A2:C2').getValues()[0];
  return { year: data[0], month: data[1], status: data[2] || 'closed' };
}

function getEmployees() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('직원명단');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  return data.map(function(row) { return row[0]; }).filter(Boolean);
}

function getApplications() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('신청현황');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  return data.filter(function(row) { return row[0] && row[1]; })
    .map(function(row) { return { name: row[0], date: row[1] }; });
}

function getAssignments() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배치결과');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  return data.filter(function(row) { return row[0]; })
    .map(function(row) { return { date: row[0], name: row[1], tag: row[2] }; });
}

function getHistory() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('근무이력');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  return data.filter(function(row) { return row[0]; })
    .map(function(row) { return { name: row[0], satCount: row[1] || 0, sunCount: row[2] || 0, totalCount: row[3] || 0 }; });
}

// ----- 쓰기 -----
function saveSettings(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정');
  sheet.getRange('A2:C2').setValues([[data.year, data.month, data.status]]);
  return { success: true };
}

function saveApplication(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('신청현황');
  var lastRow = sheet.getLastRow();

  // 기존 해당 직원 신청 삭제
  if (lastRow >= 2) {
    var existing = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    var keep = existing.filter(function(row) { return row[0] !== data.name; });
    sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
    if (keep.length > 0) {
      sheet.getRange(2, 1, keep.length, 2).setValues(keep);
    }
  }

  // 새 신청 추가
  var newLastRow = sheet.getLastRow();
  var dates = data.dates;
  var rows = dates.map(function(d) { return [data.name, d]; });
  if (rows.length > 0) {
    sheet.getRange(newLastRow + 1, 1, rows.length, 2).setValues(rows);
  }

  return { success: true };
}

function saveAssignments(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배치결과');
  clearSheet('배치결과');
  var rows = data.map(function(a) { return [a.date, a.name, a.tag]; });
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  return { success: true };
}

function saveHistory(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('근무이력');
  clearSheet('근무이력');
  var rows = data.map(function(h) { return [h.name, h.satCount, h.sunCount, h.totalCount]; });
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  return { success: true };
}

function clearSheet(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  return { success: true };
}
