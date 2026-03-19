// ===== 앱 상태 =====
const App = {
    role: null,          // 'admin' | 'employee'
    currentUser: null,   // 직원 이름
    employees: [],       // 직원 목록
    settings: { year: null, month: null, status: 'closed' }, // closed | open | assigned | confirmed
    applications: [],    // [{name, dates: ['2026-03-07', ...]}]
    assignments: [],     // [{date, name, tag}]  tag: '' | 'empty' | 'conflict' | 'manual'
    history: [],         // [{name, satCount, sunCount, totalCount}]
};

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
    showLoginScreen();
});

// ===== 토스트 =====
function showToast(msg, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ===== 로그인 화면 =====
function showLoginScreen() {
    document.body.innerHTML = `
        <div class="login-screen">
            <div class="login-box">
                <h2>주말 근무표</h2>
                <p style="color:var(--text-muted); margin-bottom:24px; font-size:0.9rem;">
                    직원은 이름을 선택하고, 담당자는 PIN을 입력하세요.
                </p>
                <div id="employee-select-wrap">
                    <select id="login-employee">
                        <option value="">이름 선택...</option>
                    </select>
                    <button class="btn btn-primary btn-full" onclick="loginAsEmployee()" style="margin-top:4px">직원 입장</button>
                </div>
                <div class="login-divider"><span>또는</span></div>
                <input type="password" id="login-pin" placeholder="담당자 PIN 입력" maxlength="10">
                <button class="btn btn-outline btn-full" onclick="loginAsAdmin()">담당자 입장</button>
            </div>
            <div class="loading" id="login-loading" style="display:none">
                <div class="spinner"></div> 데이터 불러오는 중...
            </div>
        </div>
    `;
    loadInitialData();
}

// ===== 초기 데이터 로드 =====
async function loadInitialData() {
    const loading = document.getElementById('login-loading');
    loading.style.display = 'flex';
    try {
        // 직원 목록 로드
        const empData = await SheetsAPI.read(CONFIG.SHEETS.EMPLOYEES, 'A2:A100');
        App.employees = empData.map(row => row[0]).filter(Boolean);

        const select = document.getElementById('login-employee');
        App.employees.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });

        // 설정 로드
        const settingsData = await SheetsAPI.read(CONFIG.SHEETS.SETTINGS, 'A2:C2');
        if (settingsData.length > 0) {
            App.settings.year = parseInt(settingsData[0][0]) || new Date().getFullYear();
            App.settings.month = parseInt(settingsData[0][1]) || new Date().getMonth() + 1;
            App.settings.status = settingsData[0][2] || 'closed';
        }
    } catch (e) {
        console.error('초기 데이터 로드 실패:', e);
        showToast('데이터 로드 실패. config.js 설정을 확인하세요.', 'error');
    }
    loading.style.display = 'none';
}

// ===== 직원 로그인 =====
function loginAsEmployee() {
    const name = document.getElementById('login-employee').value;
    if (!name) { showToast('이름을 선택하세요.', 'error'); return; }
    App.role = 'employee';
    App.currentUser = name;
    showEmployeeScreen();
}

// ===== 담당자 로그인 =====
function loginAsAdmin() {
    const pin = document.getElementById('login-pin').value;
    if (pin !== CONFIG.ADMIN_PIN) { showToast('PIN이 올바르지 않습니다.', 'error'); return; }
    App.role = 'admin';
    authenticateAndShowAdmin();
}

async function authenticateAndShowAdmin() {
    try {
        const tokenValid = await SheetsAPI.checkToken();
        if (!tokenValid) {
            await SheetsAPI.authenticate();
        }
        showAdminScreen();
    } catch (e) {
        console.error('인증 실패:', e);
        showToast('Google 인증이 필요합니다. 팝업을 허용하세요.', 'error');
    }
}

// ===== 로그아웃 =====
function logout() {
    App.role = null;
    App.currentUser = null;
    showLoginScreen();
}

// ================================================================
//  직원 화면
// ================================================================
async function showEmployeeScreen() {
    document.body.innerHTML = `
        <div class="header">
            <h1>주말 근무표</h1>
            <div class="header-right">
                <span>${App.currentUser}님</span>
                <button onclick="logout()">나가기</button>
            </div>
        </div>
        <div class="container" id="emp-content">
            <div class="loading"><div class="spinner"></div> 로딩 중...</div>
        </div>
    `;

    await loadAllData();

    const container = document.getElementById('emp-content');

    if (App.settings.status === 'closed') {
        container.innerHTML = `
            <div class="card" style="text-align:center; padding:60px 24px;">
                <h3>현재 신청이 열려있지 않습니다.</h3>
                <p style="color:var(--text-muted); margin-top:8px;">담당자가 신청을 오픈하면 이용할 수 있습니다.</p>
            </div>
        `;
        return;
    }

    if (App.settings.status === 'confirmed') {
        renderFinalSchedule(container);
        return;
    }

    // 신청 가능 상태 (open 또는 assigned)
    if (App.settings.status === 'assigned') {
        renderFinalSchedule(container);
        return;
    }

    renderEmployeeApplication(container);
}

function renderEmployeeApplication(container) {
    const { year, month } = App.settings;
    const myApp = App.applications.find(a => a.name === App.currentUser);
    const selectedDates = myApp ? [...myApp.dates] : [];

    container.innerHTML = `
        <div class="card">
            <h3>${year}년 ${month}월 주말 근무 신청</h3>
            <p style="color:var(--text-muted); margin-bottom:16px; font-size:0.9rem;">
                근무 희망 날짜(토·일)를 선택한 후 제출하세요.
            </p>
            <div class="calendar" id="emp-calendar"></div>
            <div style="margin-top:16px; display:flex; justify-content:space-between; align-items:center;">
                <span id="selected-count" style="color:var(--text-muted); font-size:0.9rem;">선택: 0일</span>
                <button class="btn btn-primary" onclick="submitApplication()">제출</button>
            </div>
        </div>
    `;

    function onDateClick(dateStr) {
        const idx = selectedDates.indexOf(dateStr);
        if (idx >= 0) selectedDates.splice(idx, 1);
        else selectedDates.push(dateStr);
        // 클래스만 토글 (전체 다시 그리지 않음)
        document.querySelectorAll('#emp-calendar .weekend').forEach(cell => {
            const cellDate = cell.dataset.date;
            if (cellDate === dateStr) {
                cell.classList.toggle('selected');
            }
        });
        document.getElementById('selected-count').textContent = `선택: ${selectedDates.length}일`;
    }
    renderCalendar('emp-calendar', year, month, selectedDates, onDateClick);

    document.getElementById('selected-count').textContent = `선택: ${selectedDates.length}일`;

    // 제출 함수를 전역으로 연결
    window._selectedDates = selectedDates;
}

async function submitApplication() {
    const dates = window._selectedDates;
    if (!dates || dates.length === 0) {
        showToast('최소 1일 이상 선택하세요.', 'error');
        return;
    }

    try {
        // 기존 신청 삭제 후 새로 추가
        const allApps = await SheetsAPI.read(CONFIG.SHEETS.APPLICATIONS, 'A2:B500');
        const otherApps = allApps.filter(row => row[0] !== App.currentUser);
        const myRows = dates.map(d => [App.currentUser, d]);
        const newData = [...otherApps, ...myRows];

        // 클리어 후 다시 쓰기
        await SheetsAPI.clear(CONFIG.SHEETS.APPLICATIONS, 'A2:B500');
        if (newData.length > 0) {
            await SheetsAPI.write(CONFIG.SHEETS.APPLICATIONS, `A2:B${newData.length + 1}`, newData);
        }

        showToast('신청이 완료되었습니다!', 'success');
        await loadAllData();
        renderSubmitComplete(document.getElementById('emp-content'), dates);
    } catch (e) {
        console.error('신청 실패:', e);
        showToast('신청 실패. 다시 시도하세요.', 'error');
    }
}

function renderSubmitComplete(container, dates) {
    const { year, month } = App.settings;
    const sorted = [...dates].sort();
    container.innerHTML = `
        <div class="card" style="text-align:center; padding:40px 24px;">
            <h3 style="color:var(--success); margin-bottom:16px;">신청 완료!</h3>
            <p style="margin-bottom:20px; font-size:0.95rem;">${App.currentUser}님의 ${year}년 ${month}월 근무 희망일</p>
            <div class="table-wrap" style="max-width:300px; margin:0 auto;">
                <table>
                    <thead><tr><th>날짜</th><th>요일</th></tr></thead>
                    <tbody>
                        ${sorted.map(d => {
                            const dt = new Date(d);
                            const dayName = dt.getDay() === 0 ? '일' : '토';
                            const color = dt.getDay() === 0 ? 'var(--danger)' : 'var(--primary)';
                            return `<tr><td>${dt.getMonth()+1}/${dt.getDate()}</td><td style="color:${color}">${dayName}</td></tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <p style="color:var(--text-muted); margin-top:20px; font-size:0.85rem;">총 ${dates.length}일 신청</p>
            <button class="btn btn-outline" style="margin-top:16px;" onclick="showEmployeeScreen()">다시 수정하기</button>
        </div>
    `;
}

function renderFinalSchedule(container) {
    const { year, month } = App.settings;
    const statusLabel = App.settings.status === 'confirmed' ? '확정' : '배치 중';

    container.innerHTML = `
        <div class="card">
            <h3>${year}년 ${month}월 근무표 <span class="badge ${App.settings.status === 'confirmed' ? 'badge-confirmed' : 'badge-pending'}">${statusLabel}</span></h3>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>날짜</th><th>요일</th><th>근무자</th></tr></thead>
                    <tbody id="final-table-body"></tbody>
                </table>
            </div>
        </div>
    `;

    const tbody = document.getElementById('final-table-body');
    const weekends = getWeekends(year, month);
    weekends.forEach(d => {
        const dateStr = formatDate(d);
        const dayName = d.getDay() === 0 ? '일' : '토';
        const assignment = App.assignments.find(a => a.date === dateStr);
        const name = assignment ? assignment.name : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${month}/${d.getDate()}</td>
            <td style="color:${d.getDay() === 0 ? 'var(--danger)' : 'var(--primary)'}">${dayName}</td>
            <td>${name || '<span style="color:var(--text-muted)">-</span>'}</td>
        `;
        tbody.appendChild(tr);
    });
}


// ================================================================
//  담당자 화면
// ================================================================
async function showAdminScreen() {
    document.body.innerHTML = `
        <div class="header">
            <h1>주말 근무표 - 관리</h1>
            <div class="header-right">
                <span>담당자</span>
                <button onclick="logout()">나가기</button>
            </div>
        </div>
        <div class="container">
            <div class="tabs">
                <button class="tab active" data-tab="tab-settings">설정</button>
                <button class="tab" data-tab="tab-status">신청 현황</button>
                <button class="tab" data-tab="tab-assign">배치/조정</button>
                <button class="tab" data-tab="tab-result">근무표</button>
            </div>
            <div id="tab-settings" class="tab-content active"></div>
            <div id="tab-status" class="tab-content"></div>
            <div id="tab-assign" class="tab-content"></div>
            <div id="tab-result" class="tab-content"></div>
        </div>
    `;

    // 탭 전환
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    await loadAllData();
    renderSettingsTab();
    renderStatusTab();
    renderAssignTab();
    renderResultTab();
}

// ----- 설정 탭 -----
function renderSettingsTab() {
    const tab = document.getElementById('tab-settings');
    const { year, month, status } = App.settings;
    const statusText = { closed: '마감', open: '신청 중', assigned: '배치 완료', confirmed: '확정' };

    tab.innerHTML = `
        <div class="card">
            <h3>신청 설정</h3>
            <div class="settings-form">
                <div class="form-group">
                    <label>연도</label>
                    <select id="set-year">
                        ${[0, 1, 2].map(i => {
                            const y = new Date().getFullYear() + i;
                            return `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>월</label>
                    <select id="set-month">
                        ${Array.from({length:12}, (_,i) => i+1).map(m =>
                            `<option value="${m}" ${m === month ? 'selected' : ''}>${m}월</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>현재 상태</label>
                    <span class="badge ${status === 'open' ? 'badge-open' : status === 'confirmed' ? 'badge-confirmed' : 'badge-closed'}" style="padding:8px 14px; font-size:0.9rem;">
                        ${statusText[status] || status}
                    </span>
                </div>
            </div>
            <div style="margin-top:20px; display:flex; gap:8px; flex-wrap:wrap;">
                ${status === 'closed' ? `<button class="btn btn-success" onclick="openApplications()">신청 오픈</button>` : ''}
                ${status === 'open' ? `<button class="btn btn-danger" onclick="closeApplications()">신청 마감</button>` : ''}
                ${status === 'assigned' ? `<button class="btn btn-success" onclick="confirmSchedule()">최종 확정</button>` : ''}
                ${status !== 'closed' ? `<button class="btn btn-outline" onclick="resetToClose()">초기화</button>` : ''}
            </div>
        </div>
    `;
}

async function openApplications() {
    const year = parseInt(document.getElementById('set-year').value);
    const month = parseInt(document.getElementById('set-month').value);
    try {
        // 기존 신청/배치 클리어
        await SheetsAPI.clear(CONFIG.SHEETS.APPLICATIONS, 'A2:B500');
        await SheetsAPI.clear(CONFIG.SHEETS.ASSIGNMENTS, 'A2:C500');
        // 설정 업데이트
        await SheetsAPI.write(CONFIG.SHEETS.SETTINGS, 'A2:C2', [[year, month, 'open']]);
        App.settings = { year, month, status: 'open' };
        App.applications = [];
        App.assignments = [];
        showToast(`${year}년 ${month}월 신청이 오픈되었습니다.`, 'success');
        renderSettingsTab();
        renderStatusTab();
        renderAssignTab();
        renderResultTab();
    } catch (e) {
        showToast('오픈 실패: ' + e.message, 'error');
    }
}

async function closeApplications() {
    try {
        await SheetsAPI.write(CONFIG.SHEETS.SETTINGS, 'C2:C2', [['closed']]);
        App.settings.status = 'closed';
        showToast('신청이 마감되었습니다.', 'success');
        renderSettingsTab();
    } catch (e) {
        showToast('마감 실패: ' + e.message, 'error');
    }
}

async function resetToClose() {
    if (!confirm('정말 초기화하시겠습니까? 모든 신청/배치 데이터가 삭제됩니다.')) return;
    try {
        await SheetsAPI.clear(CONFIG.SHEETS.APPLICATIONS, 'A2:B500');
        await SheetsAPI.clear(CONFIG.SHEETS.ASSIGNMENTS, 'A2:C500');
        await SheetsAPI.write(CONFIG.SHEETS.SETTINGS, 'C2:C2', [['closed']]);
        App.settings.status = 'closed';
        App.applications = [];
        App.assignments = [];
        showToast('초기화되었습니다.', 'success');
        renderSettingsTab();
        renderStatusTab();
        renderAssignTab();
        renderResultTab();
    } catch (e) {
        showToast('초기화 실패: ' + e.message, 'error');
    }
}

// ----- 신청 현황 탭 -----
function renderStatusTab() {
    const tab = document.getElementById('tab-status');
    const { year, month, status } = App.settings;

    if (status === 'closed') {
        tab.innerHTML = `<div class="card"><h3>신청 현황</h3><p style="color:var(--text-muted)">신청이 오픈되지 않았습니다.</p></div>`;
        return;
    }

    const appliedNames = [...new Set(App.applications.map(a => a.name))];

    tab.innerHTML = `
        <div class="card">
            <h3>신청 현황 (${appliedNames.length}/${App.employees.length}명 완료)</h3>
            <div class="emp-status-list" id="emp-status-list"></div>
        </div>
        <div class="card">
            <h3>신청 상세</h3>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>이름</th><th>신청 날짜</th><th>일수</th></tr></thead>
                    <tbody id="app-detail-body"></tbody>
                </table>
            </div>
        </div>
    `;

    // 직원별 상태
    const list = document.getElementById('emp-status-list');
    App.employees.forEach(name => {
        const done = appliedNames.includes(name);
        const div = document.createElement('div');
        div.className = `emp-status-item ${done ? 'done' : 'not-done'}`;
        div.innerHTML = `<span>${name}</span><span class="badge ${done ? 'badge-open' : 'badge-pending'}">${done ? '완료' : '미신청'}</span>`;
        list.appendChild(div);
    });

    // 상세 테이블
    const tbody = document.getElementById('app-detail-body');
    const grouped = {};
    App.applications.forEach(a => {
        if (!grouped[a.name]) grouped[a.name] = [];
        grouped[a.name].push(a.dates);
    });

    // applications는 [{name, dates}] 형식이므로 재그룹핑
    const appByName = {};
    App.applications.forEach(a => {
        if (!appByName[a.name]) appByName[a.name] = [];
        appByName[a.name] = a.dates;
    });

    Object.keys(appByName).sort().forEach(name => {
        const dates = appByName[name];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${name}</td>
            <td>${dates.sort().map(d => { const dt = new Date(d); return `${dt.getMonth()+1}/${dt.getDate()}`; }).join(', ')}</td>
            <td>${dates.length}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ----- 배치/조정 탭 -----
function renderAssignTab() {
    const tab = document.getElementById('tab-assign');
    const { year, month, status } = App.settings;

    tab.innerHTML = `
        <div class="card">
            <h3>자동 배치</h3>
            <p style="color:var(--text-muted); margin-bottom:12px; font-size:0.9rem;">
                신청 마감 후 자동 배치를 실행하세요. 배치 후 수동 조정이 가능합니다.
            </p>
            <button class="btn btn-primary" onclick="runAutoAssign()" ${status === 'open' || App.applications.length === 0 ? 'disabled' : ''}>
                자동 배치 실행
            </button>
        </div>
        <div class="card">
            <h3>배치 결과 / 수동 조정</h3>
            <div class="table-wrap">
                <table class="assignment-table">
                    <thead><tr><th>날짜</th><th>요일</th><th>근무자</th><th>태그</th></tr></thead>
                    <tbody id="assign-table-body"></tbody>
                </table>
            </div>
            ${App.assignments.length > 0 ? `
                <div style="margin-top:16px; display:flex; gap:8px;">
                    <button class="btn btn-primary" onclick="saveManualAdjust()">수동 조정 저장</button>
                </div>
            ` : ''}
        </div>
    `;

    renderAssignmentTable();
}

function renderAssignmentTable() {
    const tbody = document.getElementById('assign-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const { year, month } = App.settings;
    const weekends = getWeekends(year, month);

    if (App.assignments.length === 0 && weekends.length > 0) {
        weekends.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${month}/${d.getDate()}</td>
                <td>${d.getDay() === 0 ? '일' : '토'}</td>
                <td style="color:var(--text-muted)">배치 전</td>
                <td></td>
            `;
            tbody.appendChild(tr);
        });
        return;
    }

    weekends.forEach(d => {
        const dateStr = formatDate(d);
        const dayName = d.getDay() === 0 ? '일' : '토';
        const assignment = App.assignments.find(a => a.date === dateStr);
        const currentName = assignment ? assignment.name : '';
        const tag = assignment ? assignment.tag : 'empty';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${month}/${d.getDate()}</td>
            <td style="color:${d.getDay() === 0 ? 'var(--danger)' : 'var(--primary)'}">${dayName}</td>
            <td>
                <select data-date="${dateStr}" class="assign-select">
                    <option value="">(공란)</option>
                    ${App.employees.map(name =>
                        `<option value="${name}" ${name === currentName ? 'selected' : ''}>${name}</option>`
                    ).join('')}
                </select>
            </td>
            <td>
                ${tag === 'empty' ? '<span class="tag tag-empty">공란</span>' : ''}
                ${tag === 'conflict' ? '<span class="tag tag-conflict">중복조정</span>' : ''}
                ${tag === 'manual' ? '<span class="tag tag-manual">수동</span>' : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ===== 자동 배치 로직 =====
async function runAutoAssign() {
    const { year, month } = App.settings;
    const weekends = getWeekends(year, month);

    // 근무 이력 로드
    await loadHistory();

    const assignments = [];

    weekends.forEach(d => {
        const dateStr = formatDate(d);
        const dayType = d.getDay() === 0 ? 'sun' : 'sat';

        // 해당 날짜에 신청한 사람 목록
        const applicants = App.applications
            .filter(a => a.dates.includes(dateStr))
            .map(a => a.name);

        if (applicants.length === 0) {
            assignments.push({ date: dateStr, name: '', tag: 'empty' });
            return;
        }

        if (applicants.length === 1) {
            assignments.push({ date: dateStr, name: applicants[0], tag: '' });
            return;
        }

        // 우선순위 정렬
        const sorted = [...applicants].sort((a, b) => {
            const histA = App.history.find(h => h.name === a) || { satCount: 0, sunCount: 0, totalCount: 0 };
            const histB = App.history.find(h => h.name === b) || { satCount: 0, sunCount: 0, totalCount: 0 };

            // 1순위: 해당 요일 누계 (적은 사람 우선)
            const dayCountA = dayType === 'sat' ? histA.satCount : histA.sunCount;
            const dayCountB = dayType === 'sat' ? histB.satCount : histB.sunCount;
            if (dayCountA !== dayCountB) return dayCountA - dayCountB;

            // 2순위: 전체 누계 (적은 사람 우선)
            if (histA.totalCount !== histB.totalCount) return histA.totalCount - histB.totalCount;

            // 3순위: 랜덤
            return Math.random() - 0.5;
        });

        assignments.push({ date: dateStr, name: sorted[0], tag: applicants.length > 1 ? 'conflict' : '' });
    });

    App.assignments = assignments;

    // 시트에 저장
    try {
        await SheetsAPI.clear(CONFIG.SHEETS.ASSIGNMENTS, 'A2:C500');
        const rows = assignments.map(a => [a.date, a.name, a.tag]);
        if (rows.length > 0) {
            await SheetsAPI.write(CONFIG.SHEETS.ASSIGNMENTS, `A2:C${rows.length + 1}`, rows);
        }
        await SheetsAPI.write(CONFIG.SHEETS.SETTINGS, 'C2:C2', [['assigned']]);
        App.settings.status = 'assigned';

        showToast('자동 배치가 완료되었습니다.', 'success');
        renderSettingsTab();
        renderAssignTab();
        renderResultTab();
    } catch (e) {
        showToast('배치 저장 실패: ' + e.message, 'error');
    }
}

async function saveManualAdjust() {
    const selects = document.querySelectorAll('.assign-select');
    const assignments = [];

    selects.forEach(sel => {
        const date = sel.dataset.date;
        const name = sel.value;
        const existing = App.assignments.find(a => a.date === date);
        let tag = '';
        if (!name) tag = 'empty';
        else if (existing && existing.name !== name) tag = 'manual';
        else if (existing) tag = existing.tag;

        assignments.push({ date, name, tag });
    });

    App.assignments = assignments;

    try {
        await SheetsAPI.clear(CONFIG.SHEETS.ASSIGNMENTS, 'A2:C500');
        const rows = assignments.map(a => [a.date, a.name, a.tag]);
        if (rows.length > 0) {
            await SheetsAPI.write(CONFIG.SHEETS.ASSIGNMENTS, `A2:C${rows.length + 1}`, rows);
        }
        showToast('수동 조정이 저장되었습니다.', 'success');
        renderAssignTab();
        renderResultTab();
    } catch (e) {
        showToast('저장 실패: ' + e.message, 'error');
    }
}

// ===== 최종 확정 =====
async function confirmSchedule() {
    if (!confirm('최종 확정하시겠습니까? 확정 후에는 직원들이 근무표를 열람할 수 있습니다.')) return;

    try {
        // 근무 이력 업데이트
        await loadHistory();

        const { year, month } = App.settings;
        const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

        App.assignments.forEach(a => {
            if (!a.name) return;
            const d = new Date(a.date);
            const dayType = d.getDay() === 0 ? 'sun' : 'sat';

            let hist = App.history.find(h => h.name === a.name);
            if (!hist) {
                hist = { name: a.name, satCount: 0, sunCount: 0, totalCount: 0 };
                App.history.push(hist);
            }

            if (dayType === 'sat') hist.satCount++;
            else hist.sunCount++;
            hist.totalCount++;
        });

        // 이력 시트 업데이트
        await SheetsAPI.clear(CONFIG.SHEETS.HISTORY, 'A2:D500');
        const histRows = App.history.map(h => [h.name, h.satCount, h.sunCount, h.totalCount]);
        if (histRows.length > 0) {
            await SheetsAPI.write(CONFIG.SHEETS.HISTORY, `A2:D${histRows.length + 1}`, histRows);
        }

        // 상태 변경
        await SheetsAPI.write(CONFIG.SHEETS.SETTINGS, 'C2:C2', [['confirmed']]);
        App.settings.status = 'confirmed';

        showToast('최종 확정되었습니다!', 'success');
        renderSettingsTab();
        renderResultTab();
    } catch (e) {
        showToast('확정 실패: ' + e.message, 'error');
    }
}

// ----- 근무표 탭 -----
function renderResultTab() {
    const tab = document.getElementById('tab-result');
    const { year, month, status } = App.settings;
    const statusText = { closed: '마감', open: '신청 중', assigned: '배치 완료', confirmed: '확정' };

    tab.innerHTML = `
        <div class="card">
            <h3>${year}년 ${month}월 근무표
                <span class="badge ${status === 'confirmed' ? 'badge-confirmed' : status === 'assigned' ? 'badge-pending' : 'badge-closed'}">
                    ${statusText[status] || ''}
                </span>
            </h3>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>날짜</th><th>요일</th><th>근무자</th><th>태그</th></tr></thead>
                    <tbody id="result-table-body"></tbody>
                </table>
            </div>
        </div>
        <div class="card">
            <h3>근무 이력 (누계)</h3>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>이름</th><th>토요일</th><th>일요일</th><th>전체</th></tr></thead>
                    <tbody id="history-table-body"></tbody>
                </table>
            </div>
        </div>
    `;

    // 근무표
    const tbody = document.getElementById('result-table-body');
    const weekends = getWeekends(year, month);
    weekends.forEach(d => {
        const dateStr = formatDate(d);
        const assignment = App.assignments.find(a => a.date === dateStr);
        const name = assignment ? assignment.name : '';
        const tag = assignment ? assignment.tag : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${month}/${d.getDate()}</td>
            <td style="color:${d.getDay() === 0 ? 'var(--danger)' : 'var(--primary)'}">${d.getDay() === 0 ? '일' : '토'}</td>
            <td>${name || '<span style="color:var(--text-muted)">-</span>'}</td>
            <td>
                ${tag === 'empty' ? '<span class="tag tag-empty">공란</span>' : ''}
                ${tag === 'conflict' ? '<span class="tag tag-conflict">중복조정</span>' : ''}
                ${tag === 'manual' ? '<span class="tag tag-manual">수동</span>' : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 이력
    const histBody = document.getElementById('history-table-body');
    App.history.sort((a, b) => b.totalCount - a.totalCount).forEach(h => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${h.name}</td><td>${h.satCount}</td><td>${h.sunCount}</td><td>${h.totalCount}</td>`;
        histBody.appendChild(tr);
    });
}


// ================================================================
//  데이터 로드 헬퍼
// ================================================================
async function loadAllData() {
    try {
        // 설정
        const settingsData = await SheetsAPI.read(CONFIG.SHEETS.SETTINGS, 'A2:C2');
        if (settingsData.length > 0) {
            App.settings.year = parseInt(settingsData[0][0]) || new Date().getFullYear();
            App.settings.month = parseInt(settingsData[0][1]) || new Date().getMonth() + 1;
            App.settings.status = settingsData[0][2] || 'closed';
        }

        // 직원 목록
        const empData = await SheetsAPI.read(CONFIG.SHEETS.EMPLOYEES, 'A2:A100');
        App.employees = empData.map(row => row[0]).filter(Boolean);

        // 신청 현황
        const appData = await SheetsAPI.read(CONFIG.SHEETS.APPLICATIONS, 'A2:B500');
        const appMap = {};
        appData.forEach(row => {
            const name = row[0], date = row[1];
            if (!name || !date) return;
            if (!appMap[name]) appMap[name] = [];
            appMap[name].push(date);
        });
        App.applications = Object.entries(appMap).map(([name, dates]) => ({ name, dates }));

        // 배치 결과
        const assignData = await SheetsAPI.read(CONFIG.SHEETS.ASSIGNMENTS, 'A2:C500');
        App.assignments = assignData.map(row => ({
            date: row[0] || '',
            name: row[1] || '',
            tag: row[2] || ''
        })).filter(a => a.date);

        // 이력
        await loadHistory();
    } catch (e) {
        console.error('데이터 로드 실패:', e);
    }
}

async function loadHistory() {
    try {
        const histData = await SheetsAPI.read(CONFIG.SHEETS.HISTORY, 'A2:D500');
        App.history = histData.map(row => ({
            name: row[0] || '',
            satCount: parseInt(row[1]) || 0,
            sunCount: parseInt(row[2]) || 0,
            totalCount: parseInt(row[3]) || 0
        })).filter(h => h.name);
    } catch {
        App.history = [];
    }
}


// ================================================================
//  유틸리티
// ================================================================

// 해당 월의 주말(토,일) 목록 반환
function getWeekends(year, month) {
    const result = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month - 1, d);
        const day = date.getDay();
        if (day === 0 || day === 6) result.push(date);
    }
    return result;
}

// Date → 'YYYY-MM-DD'
function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 달력 렌더링
function renderCalendar(containerId, year, month, selectedDates, onClickDate) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    dayNames.forEach(name => {
        const div = document.createElement('div');
        div.className = 'day-header';
        div.textContent = name;
        container.appendChild(div);
    });

    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    // 빈 칸
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'day-cell empty';
        container.appendChild(div);
    }

    // 날짜
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month - 1, d);
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dateStr = formatDate(date);
        const isSelected = selectedDates.includes(dateStr);

        const div = document.createElement('div');
        div.className = 'day-cell';
        if (!isWeekend) div.classList.add('weekday');
        else {
            div.classList.add('weekend');
            div.dataset.date = dateStr;
            if (dayOfWeek === 0) div.classList.add('sunday');
            if (isSelected) div.classList.add('selected');
            div.addEventListener('click', () => onClickDate(dateStr));
        }
        div.textContent = d;
        container.appendChild(div);
    }
}
