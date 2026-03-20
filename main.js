// ===== 1. 앱 상태 관리 =====
const App = {
    role: null,
    currentUser: null,
    employees: [],
    settings: { year: null, month: null, status: 'closed' },
    applications: [],
    assignments: [],
    history: [],
};

// ===== 2. 초기화 및 유틸리티 =====
document.addEventListener('DOMContentLoaded', () => {
    showLoginScreen();
});

function showToast(msg, type = 'info') {
    let container = document.querySelector('.toast-container') || document.createElement('div');
    if (!container.parentElement) {
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function logout() {
    location.reload();
}

function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekends(y, m) {
    const res = [];
    const last = new Date(y, m, 0).getDate();
    for (let d = 1; d <= last; d++) {
        const dt = new Date(y, m - 1, d);
        if ([0, 6].includes(dt.getDay())) res.push(dt);
    }
    return res;
}

// ===== 3. 데이터 통합 로드 (속도 최적화) =====
async function loadAllData() {
    try {
        const data = await SheetsAPI.getFullData();
        if (!data || data.error) {
            console.error("서버 응답 오류:", data ? data.error : "응답 없음");
            return;
        }
        App.applications = data.applications || [];
        App.assignments = data.assignments || [];
        App.history = data.history || [];
        App.employees = data.employees || [];
        if (data.settings) {
            App.settings.year = parseInt(data.settings.year);
            App.settings.month = parseInt(data.settings.month);
            App.settings.status = data.settings.status;
        }
    } catch (e) {
        console.error("데이터 로드 중 예외 발생:", e);
    }
}

// ===== 4. 로그인 화면 =====
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
    } finally {
        loading.style.display = 'none';
    }
}

function loginAsEmployee() {
    const name = document.getElementById('login-employee').value;
    if (!name) return showToast('이름을 선택하세요.', 'error');
    App.role = 'employee';
    App.currentUser = name;
    showEmployeeScreen();
}

function loginAsAdmin() {
    const pin = document.getElementById('login-pin').value;
    if (pin !== CONFIG.ADMIN_PIN) return showToast('PIN이 올바르지 않습니다.', 'error');
    App.role = 'admin';
    showAdminScreen();
}

// ================================================================
//  5. 직원용 화면 (입장 시 무조건 빈 달력)
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
        <div class="container" id="emp-content"></div>`;

    const container = document.getElementById('emp-content');
    if (App.settings.status === 'closed') {
        container.innerHTML = '<div class="card" style="text-align:center; padding:50px;"><h3>신청 기간이 아닙니다.</h3></div>';
        return;
    }
    if (['confirmed', 'assigned'].includes(App.settings.status)) {
        renderFinalSchedule(container);
        return;
    }
    renderEmployeeApplication(container);
}

function renderEmployeeApplication(container) {
    const { year, month } = App.settings;
    const selectedDates = []; // 다시 접속 시 항상 빈 상태로 시작
    window._selectedDates = selectedDates;

    container.innerHTML = `
        <div class="card">
            <h3>${year}년 ${month}월 신청</h3>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">
                희망 날짜를 모두 선택하고 제출하세요.<br>
                <span style="color:var(--danger); font-weight:bold;">* 제출 시 이전 신청 내역은 현재 선택으로 대체됩니다.</span>
