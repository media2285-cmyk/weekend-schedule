// ===== 앱 상태 관리 =====
const App = {
    role: null, currentUser: null, employees: [],
    settings: { year: null, month: null, status: 'closed' },
    applications: [], assignments: [], history: [],
};

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => { showLoginScreen(); });

// ===== 토스트 알림 =====
function showToast(msg, type = 'info') {
    let container = document.querySelector('.toast-container') || document.createElement('div');
    if (!container.parentElement) { container.className = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ===== 데이터 로드 (속도 최적화) =====
async function loadAllData() {
    try {
        const data = await SheetsAPI.getFullData();
        if (!data || data.error) return;
        App.applications = data.applications || [];
        App.assignments = data.assignments || [];
        App.history = data.history || [];
        App.employees = data.employees || [];
        if (data.settings) {
            App.settings.year = parseInt(data.settings.year);
            App.settings.month = parseInt(data.settings.month);
            App.settings.status = data.settings.status;
        }
    } catch (e) { console.error("로드 오류", e); }
}

// ===== 로그인 화면 =====
async function showLoginScreen() {
    document.body.innerHTML = `
        <div class="login-screen">
            <div class="login-box">
                <h2>주말 근무표</h2>
                <p style="color:var(--text-muted); margin-bottom:24px; font-size:0.9rem;">이름 선택 후 입장하세요.</p>
                <select id="login-employee"><option value="">이름 선택...</option></select>
                <button class="btn btn-primary btn-full" onclick="loginAsEmployee()" style="margin-top:4px">직원 입장</button>
                <div class="login-divider"><span>또는</span></div>
                <input type="password" id="login-pin" placeholder="담당자 PIN 입력">
                <button class="btn btn-outline btn-full" onclick="loginAsAdmin()">담당자 입장</button>
            </div>
            <div id="login-loading" class="loading" style="display:none"><div class="spinner"></div> 로딩 중...</div>
        </div>`;
    
    const loading = document.getElementById('login-loading');
    loading.style.display = 'flex';
    try {
        await loadAllData();
        const select = document.getElementById('login-employee');
        App.employees.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            select.appendChild(opt);
        });
    } finally { loading.style.display = 'none'; }
}

function loginAsEmployee() {
    const name = document.getElementById('login-employee').value;
    if (!name) return showToast('이름을 선택하세요.', 'error');
    App.role = 'employee'; App.currentUser = name;
    showEmployeeScreen();
}

function loginAsAdmin() {
    if (document.getElementById('login-pin').value !== CONFIG.ADMIN_PIN) return showToast('PIN 오류', 'error');
    App.role = 'admin'; showAdminScreen();
}

function logout() { location.reload(); }

// ================================================================
//  직원용 화면 (항상 빈 달력으로 시작)
// ================================================================
async function showEmployeeScreen() {
    document.body.innerHTML = `
        <div class="header"><h1>주말 근무표</h1><div class="header-right"><span>${App.currentUser}님</span><button onclick="logout()">나가기</button></div></div>
        <div class="container" id="emp-content"></div>`;

    const container = document.getElementById('emp-content');
    
    // 마감 및 확정 상태 체크
    if (App.settings.status === 'closed') {
        container.innerHTML = '<div class="card" style="text-align:center; padding:50px;"><h3>신청 기간이 아닙니다.</h3></div>';
        return;
    }
    if (['confirmed', 'assigned'].includes(App.settings.status)) return renderFinalSchedule(container);

    // 무조건 신청 화면(빈 달력) 렌더링
    renderEmployeeApplication(container);
}

function renderEmployeeApplication(container) {
    const { year, month } = App.settings;
    const selectedDates = []; // [단순화] 항상 빈 배열로 시작
    window._selectedDates = selectedDates;

    container.innerHTML = `
        <div class="card">
            <h3>${year}년 ${month}월 신청</h3>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">
                희망 날짜를 모두 선택하고 제출하세요.<br>
                <span style="color:var(--danger)">* 새로 제출하면 이전 신청 내역은 삭제됩니다.</span>
            </p>
            <div class="calendar" id="emp-calendar"></div>
            <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center;">
                <span id="selected-count">선택: 0일</span>
                <button class="btn btn-primary" onclick="submitApplication()">최종 제출</button>
            </div>
        </div>`;

    renderCalendar('emp-calendar', year, month, selectedDates, (dateStr) => {
        const idx = selectedDates.indexOf(dateStr);
        idx >= 0 ? selectedDates.splice(idx, 1) : selectedDates.push(dateStr);
        document.querySelectorAll('#emp-calendar .weekend').forEach(c => {
            if (c.dataset.date === dateStr) c.classList.toggle('selected');
        });
        document.getElementById('selected-count').textContent = `선택: ${selectedDates.length}일`;
    });
}

async function submitApplication() {
    if (!window._selectedDates.length) return showToast('날짜를 선택하세요.', 'error');
    if (!confirm("제출하시겠습니까? 기존에 신청했던 내역이 있다면 모두 지워지고 현재 선택한 날짜로 변경됩니다.")) return;

    try {
        await SheetsAPI.saveApplication({ name: App.currentUser, dates: window._selectedDates });
        showToast('성공적으로 제출되었습니다!', 'success');
        renderSubmitComplete(document.getElementById('emp-content'), window._selectedDates);
    } catch (e) { showToast('제출 실패', 'error'); }
}

function renderSubmitComplete(container, dates) {
    container.innerHTML = `
        <div class="card" style="text-align:center; padding:30px;">
            <h3 style="color:var(--success)">제출 완료</h3>
            <p style="margin-bottom:20px;">${App.currentUser}님의 최종 신청 내역</p>
            <div class="table-wrap" style="max-width:250px; margin:0 auto;">
                <table><thead><tr><th>날짜</th><th>요일</th></tr></thead>
                <tbody>${dates.sort().map(d => `<tr><td>${new Date(d).getMonth()+1}/${new Date(d).getDate()}</td><td>${new Date(d).getDay()===0?'일':'토'}</td></tr>`).join('')}</tbody></table>
            </div>
            <p style="margin-top:20px; font-size:0.85rem; color:var(--text-muted);">수정을 원하시면 다시 접속하여 제출해 주세요.</p>
            <button class="btn btn-outline" style="margin-top:15px;" onclick="location.reload()">메인으로</button>
        </div>`;
}

// ===== 유틸리티 (기존과 동일) =====
function renderFinalSchedule(container) {
    container.innerHTML = `<div class="card"><h3>확정 근무표</h3><div class="table-wrap"><table><thead><tr><th>날짜</th><th>요일</th><th>근무자</th></tr></thead><tbody id="final-tbody"></tbody></table></div></div>`;
    const tbody = document.getElementById('final-tbody');
    getWeekends(App.settings.year, App.settings.month).forEach(d => {
        const dateStr = formatDate(d);
        const name = (App.assignments.find(a => a.date === dateStr) || {}).name || '-';
        tbody.innerHTML += `<tr><td>${App.settings.month}/${d.getDate()}</td><td>${d.getDay()===0?'일':'토'}</td><td>${name}</td></tr>`;
    });
}
function getWeekends(y, m) {
    const res = []; const last = new Date(y, m, 0).getDate();
    for (let d = 1; d <= last; d++) { const dt = new Date(y, m-1, d); if([0,6].includes(dt.getDay())) res.push(dt); }
    return res;
}
function formatDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function renderCalendar(id, y, m, sel, cb) {
    const el = document.getElementById(id); el.innerHTML = '';
    ['월','화','수','목','금','토','일'].forEach(n => el.innerHTML += `<div class="day-header">${n}</div>`);
    const first = (new Date(y, m-1, 1).getDay()+6)%7;
    for (let i=0; i<first; i++) el.innerHTML += '<div class="day-cell empty"></div>';
    for (let d=1; d<=new Date(y, m, 0).getDate(); d++) {
        const dt = new Date(y, m-1, d), str = formatDate(dt), isWE = [0,6].includes(dt.getDay());
        const cell = document.createElement('div');
        cell.className = `day-cell ${isWE?'weekend':'weekday'} ${sel.includes(str)?'selected':''}`;
        if (isWE) { 
            cell.dataset.date = str; cell.onclick = () => cb(str); 
            if (dt.getDay() === 0) cell.classList.add('sunday');
        }
        cell.textContent = d; el.appendChild(cell);
    }
}
async function showAdminScreen() { showToast('관리는 시트에서 해주세요.', 'info'); logout(); }
