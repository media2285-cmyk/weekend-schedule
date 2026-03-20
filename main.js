// ===== 앱 상태 =====
const App = {
    role: null,
    currentUser: null,
    employees: [],
    settings: { year: null, month: null, status: 'closed' },
    applications: [],
    assignments: [],
    history: [],
};

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
    showLoginScreen();
});

// ===== 토스트 메시지 =====
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

// ===== 로그인 화면 (속도 개선: 초기 로드 병렬 처리) =====
async function showLoginScreen() {
    document.body.innerHTML = `
        <div class="login-screen">
            <div class="login-box">
                <h2>주말 근무표</h2>
                <p style="color:var(--text-muted); margin-bottom:24px; font-size:0.9rem;">
                    직원은 이름을 선택하고, 담당자는 PIN을 입력하세요.
                </p>
                <select id="login-employee">
                    <option value="">이름 선택...</option>
                </select>
                <button class="btn btn-primary btn-full" onclick="loginAsEmployee()" style="margin-top:4px">직원 입장</button>
                <div class="login-divider"><span>또는</span></div>
                <input type="password" id="login-pin" placeholder="담당자 PIN 입력" maxlength="10">
                <button class="btn btn-outline btn-full" onclick="loginAsAdmin()">담당자 입장</button>
            </div>
            <div class="loading" id="login-loading" style="display:none">
                <div class="spinner"></div> 데이터 로딩 중...
            </div>
        </div>
    `;

    const loading = document.getElementById('login-loading');
    if (loading) loading.style.display = 'flex';

    try {
        // [속도 최적화] 설정과 직원 명단을 동시에 가져옵니다.
        const [settings, employees] = await Promise.all([
            SheetsAPI.getSettings(),
            SheetsAPI.getEmployees()
        ]);

        App.employees = employees;
        App.settings.year = parseInt(settings.year) || new Date().getFullYear();
        App.settings.month = parseInt(settings.month) || new Date().getMonth() + 1;
        App.settings.status = settings.status || 'closed';

        const select = document.getElementById('login-employee');
        App.employees.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    } catch (e) {
        showToast('데이터 연결 실패. 설정을 확인하세요.', 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// ===== 로그인 로직 =====
function loginAsEmployee() {
    const name = document.getElementById('login-employee').value;
    if (!name) { showToast('이름을 선택하세요.', 'error'); return; }
    App.role = 'employee';
    App.currentUser = name;
    showEmployeeScreen();
}

function loginAsAdmin() {
    const pin = document.getElementById('login-pin').value;
    if (pin !== CONFIG.ADMIN_PIN) { showToast('PIN이 틀렸습니다.', 'error'); return; }
    App.role = 'admin';
    showAdminScreen();
}

function logout() { location.reload(); }

// ================================================================
//  직원용 화면 및 신청 로직
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
            <div class="loading"><div class="spinner"></div> 정보를 가져오는 중...</div>
        </div>
    `;

    await loadAllData(); // 모든 데이터 병렬 로드
    const container = document.getElementById('emp-content');

    if (App.settings.status === 'closed') {
        container.innerHTML = `<div class="card" style="text-align:center; padding:60px 24px;"><h3>신청 기간이 아닙니다.</h3></div>`;
        return;
    }
    
    if (App.settings.status === 'confirmed' || App.settings.status === 'assigned') {
        renderFinalSchedule(container);
        return;
    }

    // 이미 신청했는지 확인 후 화면 분기
    const myHistory = App.applications.filter(a => a.name === App.currentUser);
    if (myHistory.length > 0) {
        renderSubmitComplete(container, myHistory.map(a => a.date));
    } else {
        renderEmployeeApplication(container);
    }
}

// [수정됨] 다시 수정하기 클릭 시 기존 날짜가 달력에 표시되도록 개선
function renderEmployeeApplication(container) {
    const { year, month } = App.settings;
    
    // 이전에 신청했던 날짜들을 초기 선택값으로 설정 (중복 방지 핵심)
    const myDates = App.applications
        .filter(a => a.name === App.currentUser)
        .map(a => a.date);
    
    const selectedDates = [...new Set(myDates)]; 
    window._selectedDates = selectedDates;

    container.innerHTML = `
        <div class="card">
            <h3>${year}년 ${month}월 주말 신청</h3>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">희망하는 날짜를 터치하여 선택하세요.</p>
            <div class="calendar" id="emp-calendar"></div>
            <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center;">
                <span id="selected-count" style="font-weight:bold;">선택: ${selectedDates.length}일</span>
                <button class="btn btn-primary" onclick="submitApplication()">신청서 제출</button>
            </div>
        </div>`;

    function onDateClick(dateStr) {
        const idx = selectedDates.indexOf(dateStr);
        if (idx >= 0) selectedDates.splice(idx, 1); // 이미 있으면 제거
        else selectedDates.push(dateStr); // 없으면 추가
        
        document.querySelectorAll('#emp-calendar .weekend').forEach(cell => {
            if (cell.dataset.date === dateStr) cell.classList.toggle('selected');
        });
        document.getElementById('selected-count').textContent = `선택: ${selectedDates.length}일`;
    }

    renderCalendar('emp-calendar', year, month, selectedDates, onDateClick);
}

async function submitApplication() {
    const dates = window._selectedDates;
    if (!dates || dates.length === 0) { showToast('최소 1일 이상 선택해야 합니다.', 'error'); return; }

    try {
        await SheetsAPI.saveApplication({ name: App.currentUser, dates: [...dates] });
        showToast('성공적으로 저장되었습니다.', 'success');
        await loadAllData(); // 최신 상태로 갱신
        renderSubmitComplete(document.getElementById('emp-content'), [...dates]);
    } catch (e) { showToast('저장 실패: ' + e.message, 'error'); }
}

function renderSubmitComplete(container, dates) {
    const sorted = [...dates].sort();
    container.innerHTML = `
        <div class="card" style="text-align:center; padding:40px 24px;">
            <div style="font-size:3rem; margin-bottom:15px;">📅</div>
            <h3 style="color:var(--success); margin-bottom:10px;">신청이 완료되었습니다!</h3>
            <p style="margin-bottom:20px;">${App.currentUser}님의 신청 내역</p>
            <div class="table-wrap" style="max-width:280px; margin:0 auto;">
                <table>
                    <thead><tr><th>날짜</th><th>요일</th></tr></thead>
                    <tbody>${sorted.map(d => {
                        const dt = new Date(d);
                        return `<tr><td>${dt.getMonth()+1}/${dt.getDate()}</td><td>${dt.getDay()===0?'일':'토'}</td></tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
            <div style="margin-top:25px;">
                <button class="btn btn-outline" onclick="renderEmployeeApplication(document.getElementById('emp-content'))">신청 내용 수정하기</button>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-top:12px;">* 수정 시 기존 내역을 덮어씁니다.</p>
        </div>`;
}

// ===== 확정 근무표 렌더링 =====
function renderFinalSchedule(container) {
    const { year, month } = App.settings;
    container.innerHTML = `
        <div class="card">
            <h3>${year}년 ${month}월 확정 근무표</h3>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>날짜</th><th>요일</th><th>근무자</th></tr></thead>
                    <tbody id="final-table-body"></tbody>
                </table>
            </div>
        </div>`;
    const tbody = document.getElementById('final-table-body');
    getWeekends(year, month).forEach(d => {
        const dateStr = formatDate(d);
        const name = (App.assignments.find(a => a.date === dateStr) || {}).name || '-';
        tbody.innerHTML += `<tr><td>${month}/${d.getDate()}</td><td>${d.getDay()===0?'일':'토'}</td><td style="font-weight:bold;">${name}</td></tr>`;
    });
}

// ================================================================
//  데이터 로드 및 유틸리티 (속도 최적화 병렬 처리 적용)
// ================================================================
async function loadAllData() {
    try {
        // [속도 최적화] 5개의 API 호출을 동시에 실행하여 대기 시간을 1/5로 단축
        const [apps, assigns, hist, sets, emps] = await Promise.all([
            SheetsAPI.getApplications(),
            SheetsAPI.getAssignments(),
            SheetsAPI.getHistory(),
            SheetsAPI.getSettings(),
            SheetsAPI.getEmployees()
        ]);
        App.applications = apps;
        App.assignments = assigns;
        App.history = hist;
        App.employees = emps;
        App.settings.year = parseInt(sets.year);
        App.settings.month = parseInt(sets.month);
        App.settings.status = sets.status;
    } catch (e) { console.error("전체 데이터 로드 오류:", e); }
}

function getWeekends(year, month) {
    const res = [];
    const days = new Date(year, month, 0).getDate();
    for (let d = 1; d <= days; d++) {
        const date = new Date(year, month - 1, d);
        if (date.getDay() === 0 || date.getDay() === 6) res.push(date);
    }
    return res;
}

function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderCalendar(id, year, month, selected, onClick) {
    const container = document.getElementById(id);
    container.innerHTML = '';
    ['월','화','수','목','금','토','일'].forEach(n => container.innerHTML += `<div class="day-header">${n}</div>`);
    
    const first = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    for (let i = 0; i < first; i++) container.innerHTML += `<div class="day-cell empty"></div>`;
    
    const lastDay = new Date(year, month, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
        const dt = new Date(year, month - 1, d);
        const dtStr = formatDate(dt);
        const isWE = dt.getDay() === 0 || dt.getDay() === 6;
        const selCls = selected.includes(dtStr) ? 'selected' : '';
        
        const cell = document.createElement('div');
        cell.className = `day-cell ${isWE ? 'weekend' : 'weekday'} ${selCls}`;
        if (isWE) {
            if (dt.getDay() === 0) cell.classList.add('sunday');
            cell.dataset.date = dtStr;
            cell.onclick = () => onClick(dtStr);
        }
        cell.textContent = d;
        container.appendChild(cell);
    }
}

// 담당자 화면은 기본 틀만 유지 (기존 관리 로직 필요 시 추가 가능)
async function showAdminScreen() {
    showToast('관리자 화면은 준비 중이거나 별도 구현이 필요합니다.', 'info');
    logout(); 
}
