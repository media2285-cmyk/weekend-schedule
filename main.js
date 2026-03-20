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
                <select id="login-employee">
                    <option value="">이름 선택...</option>
                </select>
                <button class="btn btn-primary btn-full" onclick="loginAsEmployee()" style="margin-top:4px">직원 입장</button>
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
    if (loading) loading.style.display = 'flex';
    try {
        const [settings, employees] = await Promise.all([
            SheetsAPI.getSettings(),
            SheetsAPI.getEmployees()
        ]);

        App.employees = employees;
        const select = document.getElementById('login-employee');
        if (select) {
            App.employees.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            });
        }

        App.settings.year = parseInt(settings.year) || new Date().getFullYear();
        App.settings.month = parseInt(settings.month) || new Date().getMonth() + 1;
        App.settings.status = settings.status || 'closed';
    } catch (e) {
        console.error('초기 데이터 로드 실패:', e);
        showToast('데이터 로드 실패. 설정을 확인하세요.', 'error');
    }
    if (loading) loading.style.display = 'none';
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
    showAdminScreen();
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

    if (App.settings.status === 'confirmed' || App.settings.status === 'assigned') {
        renderFinalSchedule(container);
        return;
    }

    // 이미 신청 내역이 있는지 확인
    const myHistory = App.applications.filter(a => a.name === App.currentUser);
    if (myHistory.length > 0) {
        renderSubmitComplete(container, myHistory.map(a => a.date));
    } else {
        renderEmployeeApplication(container);
    }
}

function renderEmployeeApplication(container) {
    const { year, month } = App.settings;
    const myDates = App.applications.filter(a => a.name === App.currentUser).map(a => a.date);
    const selectedDates = [...myDates];

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
        document.querySelectorAll('#emp-calendar .weekend').forEach(cell => {
            if (cell.dataset.date === dateStr) cell.classList.toggle('selected');
        });
        document.getElementById('selected-count').textContent = `선택: ${selectedDates.length}일`;
    }
    renderCalendar('emp-calendar', year, month, selectedDates, onDateClick);
    document.getElementById('selected-count').textContent = `선택: ${selectedDates.length}일`;
    window._selectedDates = selectedDates;
}

async function submitApplication() {
    const dates = window._selectedDates;
    if (!dates || dates.length === 0) {
        showToast('최소 1일 이상 선택하세요.', 'error');
        return;
    }

    try {
        await SheetsAPI.saveApplication({ name: App.currentUser, dates: [...dates] });
        showToast('신청이 완료되었습니다!', 'success');
        // 신청 후 전체 데이터를 다시 불러와서 화면 갱신
        await loadAllData(); 
        renderSubmitComplete(document.getElementById('emp-content'), [...dates]);
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
            <div class="complete-icon" style="font-size:3rem; margin-bottom:10px;">✅</div>
            <h3 style="color:var(--success); margin-bottom:16px;">이미 신청하셨습니다!</h3>
            <p style="margin-bottom:20px; font-size:0.95rem;">${App.currentUser}님의 ${year}년 ${month}월 신청 내역</p>
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
            <p style="color:var(--text-muted); margin-top:20px; font-size:0.85rem;">총 ${dates.length}일 신청됨</p>
            <div style="display:flex; gap:10px; justify-content:center; margin-top:16px;">
                <button class="btn btn-outline" onclick="renderEmployeeApplication(document.getElementById('emp-content'))">다시 수정하기</button>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-top:10px;">* 수정 시 기존 내역은 무시되고 새로 선택한 날짜만 저장됩니다.</p>
        </div>
    `;
}
// (이하 중복 코드 생략 - 담당자 화면 및 유틸리티 로직은 기존과 동일하나, 
// saveHistory의 시트 이름 버그는 구글 스크립트 쪽에서 이미 수정했으므로 그대로 사용 가능합니다.)
