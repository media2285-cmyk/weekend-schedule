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

// ===== 데이터 통합 로드 (속도 최적화 핵심) =====
async function loadAllData() {
    try {
        // 단 한 번의 호출로 모든 데이터를 가져옴
        const data = await SheetsAPI.getFullData();
        
        if (!data || data.error) {
            console.error("데이터 로드 실패:", data ? data.error : "응답 없음");
            return;
        }

        // 앱 상태 업데이트
        App.applications = data.applications || [];
        App.assignments = data.assignments || [];
        App.history = data.history || [];
        App.employees = data.employees || [];
        
        if (data.settings) {
            App.settings.year = parseInt(data.settings.year) || new Date().getFullYear();
            App.settings.month = parseInt(data.settings.month) || new Date().getMonth() + 1;
            App.settings.status = data.settings.status || 'closed';
        }
    } catch (e) {
        console.error("통합 로딩 중 오류 발생:", e);
    }
}

// ===== 로그인 화면 =====
async function showLoginScreen() {
    document.body.innerHTML = `
        <div class="login-screen">
            <div class="login-box">
                <h2>주말 근무표</h2>
                <p style="color:var(--text-muted); margin-bottom:24px; font-size:0.9rem;">
                    이름 선택 후 입장하세요.
                </p>
                <select id="login-employee">
                    <option value="">이름 선택...</option>
                </select>
                <button class="btn btn-primary btn-full" onclick="loginAsEmployee()" style="margin-top:4px">직원 입장</button>
                <div class="login-divider"><span>또는</span></div>
                <input type="password" id="login-pin" placeholder="담당자 PIN 입력">
                <button class="btn btn-outline btn-full" onclick="loginAsAdmin()">담당자 입장</button>
            </div>
            <div id="login-loading" class="loading" style="display:none">
                <div class="spinner"></div> 데이터 로딩 중...
            </div>
        </div>
    `;
    
    const loading = document.getElementById('login-loading');
    if (loading) loading.style.display = 'flex';

    try {
        await loadAllData(); // 통합 데이터 로드 실행
        const select = document.getElementById('login-employee');
        if (select) {
            App.employees.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        showToast('서버 연결 실패', 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function loginAsEmployee() {
    const name = document.getElementById('login-employee').value;
    if (!name) { showToast('이름을 선택하세요.', 'error'); return; }
    App.role = 'employee';
    App.currentUser = name;
    showEmployeeScreen();
}

function loginAsAdmin() {
    const pin = document.getElementById('login-pin').value;
    if (pin !== CONFIG.ADMIN_PIN) { showToast('PIN이 올바르지 않습니다.', 'error'); return; }
    App.role = 'admin';
    showAdminScreen();
}

function logout() { location.reload(); }

// ================================================================
//  직원용 화면
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
            <div class="loading"><div class="spinner"></div> 정보를 동기화 중...</div>
        </div>
    `;

    await loadAllData(); 
    const container = document.getElementById('emp-content');

    if (App.settings.status === 'closed') {
        container.innerHTML = '<div class="card" style="text-align:center; padding:60px 24px;"><h3>신청 기간이 아닙니다.</h3></div>';
        return;
    }

    if (['confirmed', 'assigned'].includes(App.settings.status)) {
        renderFinalSchedule(container);
        return;
    }

    // 이미 신청했는지 확인
    const myHistory = App.applications.filter(a => a.name === App.currentUser);
    if (myHistory.length > 0) {
        renderSubmitComplete(container, myHistory.map(a => a.date));
    } else {
        renderEmployeeApplication(container);
    }
}

function renderEmployeeApplication(container) {
    const { year, month } = App.settings;
    
    // 이전에 신청했던 날짜들 초기화 (중복 선택 방지)
    const myDates = App.applications
        .filter(a => a.name === App.currentUser)
        .map(a => a.date);
    const selectedDates = [...new Set(myDates)]; 
    window._selectedDates = selectedDates;

    container.innerHTML = `
        <div class="card">
            <h3>${year}년 ${month}월 주말 신청</h3>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">희망 날짜를 터치하세요. (이미 신청한 날짜는 파란색)</p>
            <div class="calendar" id="emp-calendar"></div>
            <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center;">
                <span id="selected-count">선택: ${selectedDates.length}일</span>
                <button class="btn btn-primary" onclick="submitApplication()">제출하기</button>
            </div>
        </div>`;

    renderCalendar('emp-calendar', year, month, selectedDates, (dateStr) => {
        const idx = selectedDates.indexOf(dateStr);
        if (idx >= 0) selectedDates.splice(idx, 1);
        else selectedDates.push(dateStr);
        
        document.querySelectorAll('#emp-calendar .weekend').forEach(c => {
            if (c.dataset.date === dateStr) c.classList.toggle('selected');
        });
        document.getElementById('selected-count').textContent = `선택: ${selectedDates.length}일`;
    });
}

async function submitApplication() {
    if (!window._selectedDates.length) return showToast('최소 1일 이상 선택하세요.', 'error');
    try {
        await SheetsAPI.saveApplication({ name: App.currentUser, dates: window._selectedDates });
        showToast('저장 성공!', 'success');
        await loadAllData();
        renderSubmitComplete(document.getElementById('emp-content'), window._selectedDates);
    } catch (e) {
        showToast('저장 실패: ' + e.message, 'error');
    }
}

function renderSubmitComplete(container, dates) {
    container.innerHTML = `
        <div class="card" style="text-align:center; padding:40px 24px;">
            <h3 style="color:var(--success)">신청이 완료되었습니다.</h3>
            <div class="table-wrap" style="max-width:280px; margin:20px auto;">
                <table>
                    <thead><tr><th>날짜</th><th>요일</th></tr></thead>
                    <tbody>${dates.sort().map(d => {
                        const dt = new Date(d);
                        return `<tr><td>${dt.getMonth()+1}/${dt.getDate()}</td><td>${dt.getDay()===0?'일':'토'}</td></tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
            <button class="btn btn-outline" onclick="renderEmployeeApplication(document.getElementById('emp-content'))">신청 내용 수정하기</button>
        </div>`;
}

function renderFinalSchedule(container) {
    container.innerHTML = `<div class="card"><h3>확정 근무표</h3><div class="table-wrap"><table><thead><tr><th>날짜</th><th>요일</th><th>근무자</th></tr></thead><tbody id="final-tbody"></tbody></table></div></div>`;
    const tbody = document.getElementById('final-tbody');
    getWeekends(App.settings.year, App.settings.month).forEach(d => {
        const dateStr = formatDate(d);
        const name = (App.assignments.find(a => a.date === dateStr) || {}).name || '-';
        tbody.innerHTML += `<tr><td>${App.settings.month}/${d.getDate()}</td><td>${d.getDay()===0?'일':'토'}</td><td style="font-weight:bold;">${name}</td></tr>`;
    });
}

// ================================================================
//  유틸리티 및 헬퍼
// ================================================================
function getWeekends(y, m) {
    const res = [];
    const last = new Date(y, m, 0).getDate();
    for (let d = 1; d <= last; d++) {
        const dt = new Date(y, m-1, d);
        if ([0,6].includes(dt.getDay())) res.push(dt);
    }
    return res;
}

function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderCalendar(id, y, m, sel, cb) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    ['월','화','수','목','금','토','일'].forEach(n => el.innerHTML += `<div class="day-header">${n}</div>`);
    
    const first = (new Date(y, m-1, 1).getDay()+6)%7;
    for (let i=0; i<first; i++) el.innerHTML += '<div class="day-cell empty"></div>';
    
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let d=1; d<=daysInMonth; d++) {
        const dt = new Date(y, m-1, d);
        const str = formatDate(dt);
        const isWE = [0,6].includes(dt.getDay());
        const cell = document.createElement('div');
        cell.className = `day-cell ${isWE?'weekend':'weekday'} ${sel.includes(str)?'selected':''}`;
        if (isWE) {
            cell.dataset.date = str;
            cell.onclick = () => cb(str);
            if (dt.getDay() === 0) cell.classList.add('sunday');
        }
        cell.textContent = d;
        el.appendChild(cell);
    }
}

// 담당자 화면 (필요 시 기존 관리 로직 추가)
async function showAdminScreen() {
    showToast('관리자 기능은 스프레드시트에서 직접 확인해주세요.', 'info');
    logout();
}
