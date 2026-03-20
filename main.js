// ===== 앱 상태 관리 =====
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

// ===== 데이터 통합 로드 (속도 최적화) =====
async function loadAllData() {
    try {
        const data = await SheetsAPI.getFullData();
        if (!data || data.error) return;

        // [중복 방지 로직 추가] 서버에서 온 데이터 자체의 중복을 제거
        App.applications = (data.applications || []).filter((v, i, a) => 
            a.findIndex(t => (t.name === v.name && t.date === v.date)) === i
        );
        
        App.assignments = data.assignments || [];
        App.history = data.history || [];
        App.employees = data.employees || [];
        
        if (data.settings) {
            App.settings.year = parseInt(data.settings.year) || new Date().getFullYear();
            App.settings.month = parseInt(data.settings.month) || new Date().getMonth() + 1;
            App.settings.status = data.settings.status || 'closed';
        }
    } catch (e) { console.error("데이터 로드 오류:", e); }
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
            <div id="login-loading" class="loading" style="display:none"><div class="spinner"></div> 데이터 로딩 중...</div>
        </div>`;
    
    const loading = document.getElementById('login-loading');
    if (loading) loading.style.display = 'flex';
    try {
        await loadAllData();
        const select = document.getElementById('login-employee');
        if (select) App.employees.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            select.appendChild(opt);
        });
    } finally { if (loading) loading.style.display = 'none'; }
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

// ===== 직원용 화면 =====
async function showEmployeeScreen() {
    document.body.innerHTML = `
        <div class="header"><h1>주말 근무표</h1><div class="header-right"><span>${App.currentUser}님</span><button onclick="logout()">나가기</button></div></div>
        <div class="container" id="emp-content"><div class="loading"><div class="spinner"></div> 로딩 중...</div></div>`;

    await loadAllData(); 
    const container = document.getElementById('emp-content');
    if (App.settings.status === 'closed') {
        container.innerHTML = '<div class="card" style="text-align:center; padding:50px;"><h3>신청 기간이 아닙니다.</h3></div>';
        return;
    }
    if (['confirmed', 'assigned'].includes(App.settings.status)) return renderFinalSchedule(container);

    const myHistory = App.applications.filter(a => a.name === App.currentUser);
    if (myHistory.length > 0) {
        // 표시할 때 중복 제거 (날짜만 추출해서 Set으로 중복 제거)
        const uniqueDates = [...new Set(myHistory.map(a => a.date))];
        renderSubmitComplete(container, uniqueDates);
    } else {
        renderEmployeeApplication(container);
    }
}

function renderEmployeeApplication(container) {
    const { year, month } = App.settings;
    const myDates = App.applications.filter(a => a.name === App.currentUser).map(a => a.date);
    const selectedDates = [...new Set(myDates)]; 
    window._selectedDates = selectedDates;

    container.innerHTML = `
        <div class="card">
            <h3>${year}년 ${month}월 신청</h3>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">희망 날짜를 선택하세요.</p>
            <div class="calendar" id="emp-calendar"></div>
            <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center;">
                <span id="selected-count">선택: ${selectedDates.length}일</span>
                <button class="btn btn-primary" onclick="submitApplication()">제출하기</button>
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
    try {
        await SheetsAPI.saveApplication({ name: App.currentUser, dates: window._selectedDates });
        showToast('저장 성공!', 'success');
        await loadAllData();
        const myDates = App.applications.filter(a => a.name === App.currentUser).map(a => a.date);
        renderSubmitComplete(document.getElementById('emp-content'), [...new Set(myDates)]);
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

function renderSubmitComplete(container, dates) {
    const sorted = dates.sort();
    container.innerHTML = `
        <div class="card" style="text-align:center; padding:30px;">
            <h3 style="color:var(--success)">신청 완료</h3>
            <div class="table-wrap" style="max-width:300px; margin:20px auto;">
                <table><thead><tr><th>날짜</th><th>요일</th></tr></thead>
                <tbody>${sorted.map(d => {
                    const dt = new Date(d);
                    return `<tr><td>${dt.getMonth()+1}/${dt.getDate()}</td><td>${dt.getDay()===0?'일':'토'}</td></tr>`;
                }).join('')}</tbody></table>
            </div>
            <button class="btn btn-outline" onclick="renderEmployeeApplication(document.getElementById('emp-content'))">수정하기</button>
        </div>`;
}

function renderFinalSchedule(container) {
    container.innerHTML = `<div class="card"><h3>확정 근무표</h3><div class="table-wrap"><table><thead><tr><th>날짜</th><th>요일</th><th>근무자</th></tr></thead><tbody id="final-tbody"></tbody></table></div></div>`;
    const tbody = document.getElementById('final-tbody');
    getWeekends(App.settings.year, App.settings.month).forEach(d => {
        const dateStr = formatDate(d);
        const name = (App.assignments.find(a => a.date === dateStr) || {}).name || '-';
        tbody.innerHTML += `<tr><td>${App.settings.month}/${d.getDate()}</td><td>${d.getDay()===0?'일':'토'}</td><td>${name}</td></tr>`;
    });
}

// ===== 유틸리티 =====
function getWeekends(y, m) {
    const res = []; const last = new Date(y, m, 0).getDate();
    for (let d = 1; d <= last; d++) { const dt = new Date(y, m-1, d); if([0,6].includes(dt.getDay())) res.push(dt); }
    return res;
}
function formatDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function renderCalendar(id, y, m, sel, cb) {
    const el = document.getElementById(id); if(!el) return; el.innerHTML = '';
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
