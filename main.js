const App = {
    role: null, currentUser: null, employees: [],
    settings: { year: null, month: null, status: 'closed' },
    applications: [], assignments: [], history: [],
};

document.addEventListener('DOMContentLoaded', () => { showLoginScreen(); });

function showToast(msg, type = 'info') {
    let container = document.querySelector('.toast-container') || document.createElement('div');
    if (!container.parentElement) { container.className = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

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
    loading.style.display = 'flex';
    try {
        await loadAllData(); // 여기서 모든 데이터를 한 번에 가져옴
        const select = document.getElementById('login-employee');
        App.employees.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            select.appendChild(opt);
        });
    } catch (e) { showToast('데이터 로드 실패', 'error'); }
    loading.style.display = 'none';
}

function loginAsEmployee() {
    const name = document.getElementById('login-employee').value;
    if (!name) return showToast('이름을 선택하세요.', 'error');
    App.role = 'employee'; App.currentUser = name;
    showEmployeeScreen();
}

function loginAsAdmin() {
    if (document.getElementById('login-pin').value !== CONFIG.ADMIN_PIN) return showToast('PIN 틀림', 'error');
    App.role = 'admin'; showAdminScreen();
}

function logout() { location.reload(); }

async function loadAllData() {
    try {
        const data = await SheetsAPI.getFullData(); // 단 1회 호출
        App.applications = data.applications;
        App.assignments = data.assignments;
        App.history = data.history;
        App.settings = data.settings;
        App.employees = data.employees;
        App.settings.year = parseInt(App.settings.year);
        App.settings.month = parseInt(App.settings.month);
    } catch (e) { console.error("데이터 로드 오류", e); }
}

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
    myHistory.length > 0 ? renderSubmitComplete(container, myHistory.map(a => a.date)) : renderEmployeeApplication(container);
}

function renderEmployeeApplication(container) {
    const { year, month } = App.settings;
    const selectedDates = [...new Set(App.applications.filter(a => a.name === App.currentUser).map(a => a.date))];
    window._selectedDates = selectedDates;

    container.innerHTML = `
        <div class="card">
            <h3>${year}년 ${month}월 신청</h3>
            <div class="calendar" id="emp-calendar"></div>
            <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center;">
                <span id="selected-count">선택: ${selectedDates.length}일</span>
                <button class="btn btn-primary" onclick="submitApplication()">제출하기</button>
            </div>
        </div>`;

    renderCalendar('emp-calendar', year, month, selectedDates, (dateStr) => {
        const idx = selectedDates.indexOf(dateStr);
        idx >= 0 ? selectedDates.splice(idx, 1) : selectedDates.push(dateStr);
        document.querySelectorAll('#emp-calendar .weekend').forEach(c => { if(c.dataset.date === dateStr) c.classList.toggle('selected'); });
        document.getElementById('selected-count').textContent = `선택: ${selectedDates.length}일`;
    });
}

async function submitApplication() {
    if (!window._selectedDates.length) return showToast('날짜를 선택하세요.', 'error');
    try {
        await SheetsAPI.saveApplication({ name: App.currentUser, dates: window._selectedDates });
        showToast('저장되었습니다.', 'success');
        await loadAllData();
        renderSubmitComplete(document.getElementById('emp-content'), window._selectedDates);
    } catch (e) { showToast('실패', 'error'); }
}

function renderSubmitComplete(container, dates) {
    container.innerHTML = `
        <div class="card" style="text-align:center; padding:30px;">
            <h3 style="color:var(--success)">신청 완료</h3>
            <div class="table-wrap" style="max-width:250px; margin:20px auto;">
                <table><thead><tr><th>날짜</th><th>요일</th></tr></thead>
                <tbody>${dates.sort().map(d => `<tr><td>${new Date(d).getMonth()+1}/${new Date(d).getDate()}</td><td>${new Date(d).getDay()===0?'일':'토'}</td></tr>`).join('')}</tbody></table>
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

async function showAdminScreen() { showToast('관리 기능은 스프레드시트에서 직접 확인하세요.', 'info'); logout(); }

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
        if (isWE) { cell.dataset.date = str; cell.onclick = () => cb(str); }
        cell.textContent = d; el.appendChild(cell);
    }
}
