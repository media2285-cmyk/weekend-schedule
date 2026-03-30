const App = {
    role: null,
    currentUser: null,
    employees: [],
    settings: { year: null, month: null, status: 'closed' },
    applications: [],
    assignments: [],
    history: []
};

document.addEventListener('DOMContentLoaded', () => showLoginScreen());

async function loadAllData() {
    const data = await SheetsAPI.getFullData();
    if (data && !data.error) {
        App.employees = data.employees || [];
        App.applications = data.applications || [];
        App.assignments = data.assignments || [];
        App.history = data.history || [];
        App.settings = {
            year: parseInt(data.settings.year),
            month: parseInt(data.settings.month),
            status: data.settings.status
        };
    }
}

async function showLoginScreen() {
    document.getElementById('app').innerHTML = `
        <div class="login-screen">
            <div class="login-box">
                <h2 style="margin-bottom:8px">주말 근무 신청</h2>
                <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:24px">성함을 선택하거나 관리자 PIN을 입력하세요.</p>
                <select id="login-name" class="btn btn-outline btn-full" style="text-align:left; margin-bottom:10px;"><option value="">직원 선택...</option></select>
                <button class="btn btn-primary btn-full" onclick="loginEmployee()">직원 로그인</button>
                <div style="margin:20px 0; text-align:center; font-size:0.8rem; color:#cbd5e1">OR</div>
                <input type="password" id="admin-pin" placeholder="관리자 PIN" class="btn btn-outline btn-full" style="text-align:left">
                <button class="btn btn-outline btn-full" onclick="loginAdmin()">관리자 접속</button>
            </div>
        </div>
    `;
    await loadAllData();
    const select = document.getElementById('login-name');
    App.employees.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        select.appendChild(opt);
    });
}

function loginEmployee() {
    const name = document.getElementById('login-name').value;
    if (!name) return alert('이름을 선택해주세요.');
    App.currentUser = name;
    App.role = 'employee';
    showEmployeeScreen();
}

function loginAdmin() {
    const pin = document.getElementById('admin-pin').value;
    if (pin !== CONFIG.ADMIN_PIN) return alert('PIN 번호가 틀립니다.');
    App.role = 'admin';
    showAdminScreen();
}

async function showEmployeeScreen() {
    document.getElementById('app').innerHTML = `
        <div class="header"><h3>${App.currentUser}님</h3><button class="btn btn-outline" onclick="location.reload()">로그아웃</button></div>
        <div class="container" id="main-container"></div>
    `;
    const container = document.getElementById('main-container');
    if (App.settings.status === 'closed') {
        container.innerHTML = `<div class="card" style="text-align:center"><h3>지금은 신청 기간이 아닙니다.</h3></div>`;
        return;
    }
    if (App.settings.status === 'confirmed') {
        showFinalSchedule(container);
        return;
    }

    const selectedDates = [];
    window._selectedDates = selectedDates;

    container.innerHTML = `
        <div class="card">
            <h3>${App.settings.year}년 ${App.settings.month}월 신청</h3>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:15px;">희망하는 주말을 모두 선택하세요.</p>
            <div class="calendar" id="calendar-grid"></div>
            <div class="selected-summary" id="selected-summary">선택된 날짜가 없습니다.</div>
            <button class="btn btn-primary btn-full" style="margin-top:10px" onclick="submitRequest()">최종 제출하기</button>
        </div>
    `;
    renderCalendar('calendar-grid', App.settings.year, App.settings.month, selectedDates);
}

function renderCalendar(id, y, m, selected) {
    const grid = document.getElementById(id);
    const days = ['월','화','수','목','금','토','일'];
    days.forEach(d => grid.innerHTML += `<div class="day-header">${d}</div>`);

    const firstDay = (new Date(y, m-1, 1).getDay() + 6) % 7;
    const lastDate = new Date(y, m, 0).getDate();

    for(let i=0; i<firstDay; i++) grid.innerHTML += `<div class="day-cell"></div>`;

    for(let d=1; d<=lastDate; d++) {
        const date = new Date(y, m-1, d);
        const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isWeekend = [0, 6].includes(date.getDay());
        const cell = document.createElement('div');
        cell.className = `day-cell ${isWeekend ? 'weekend' : 'weekday'} ${date.getDay() === 0 ? 'sunday' : ''}`;
        cell.textContent = d;
        if(isWeekend) {
            cell.onclick = () => {
                cell.classList.toggle('selected');
                const idx = selected.indexOf(dateStr);
                idx > -1 ? selected.splice(idx, 1) : selected.push(dateStr);
                updateSelectedSummary(selected);
            };
        }
        grid.appendChild(cell);
    }
}

function updateSelectedSummary(selected) {
    const summary = document.getElementById('selected-summary');
    if (!summary) return;
    if (selected.length === 0) {
        summary.innerHTML = '선택된 날짜가 없습니다.';
    } else {
        const sorted = [...selected].sort();
        summary.innerHTML = `<span>${selected.length}일 선택됨</span> — ${sorted.map(d => {
            const date = new Date(d);
            const dow = ['일','월','화','수','목','금','토'][date.getDay()];
            return `${date.getMonth()+1}/${date.getDate()}(${dow})`;
        }).join(', ')}`;
    }
}

async function submitRequest() {
    if(!window._selectedDates.length) return alert('최소 하루 이상 선택해주세요.');
    if(!confirm('기존 신청 내역이 초기화됩니다. 계속할까요?')) return;

    const btn = document.querySelector('.btn-primary');
    btn.disabled = true;
    btn.textContent = '저장 중... 잠시만 기다려주세요 ⏳';

    try {
        await SheetsAPI.saveApplication({ name: App.currentUser, dates: window._selectedDates });
        alert('성공적으로 저장되었습니다.');
        location.reload();
    } catch(e) {
        alert('저장에 실패했습니다. 다시 시도해주세요.');
        btn.disabled = false;
        btn.textContent = '최종 제출하기';
    }
}

function showFinalSchedule(container) {
    const assignments = App.assignments || [];
    if (assignments.length === 0) {
        container.innerHTML = `<div class="card" style="text-align:center"><h3>아직 확정된 근무표가 없습니다.</h3></div>`;
        return;
    }
    container.innerHTML = `
        <div class="card">
            <h3>${App.settings.year}년 ${App.settings.month}월 근무표</h3>
            <div class="table-wrap" style="margin-top:15px;">
                <table>
                    <thead><tr><th>날짜</th><th>근무자</th></tr></thead>
                    <tbody>
                        ${assignments.map(a => `
                            <tr>
                                <td>${formatDateKR(a.date)}</td>
                                <td>${a.name || '—'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function formatDateKR(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const dow = ['일','월','화','수','목','금','토'][date.getDay()];
    return `${date.getMonth()+1}/${date.getDate()}(${dow})`;
}

async function showAdminScreen() {
    document.getElementById('app').innerHTML = `
        <div class="header">
            <h1>운영자 모드</h1>
            <button class="btn btn-outline" onclick="logout()">로그아웃</button>
        </div>
        <div class="container" id="admin-content">
            <div class="loading"><div class="spinner"></div> 데이터를 불러오는 중...</div>
        </div>
    `;

    await loadAllData();
    renderAdminScreen();
}

function renderAdminScreen() {
    const container = document.getElementById('admin-content');
    container.innerHTML = `
        <div class="card">
            <h3>📅 근무표 생성 설정</h3>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:15px;">
                <div>
                    <label style="font-size:0.8rem; color:var(--text-muted);">연도</label>
                    <input type="number" id="set-year" value="${App.settings.year}" class="btn btn-outline btn-full" style="text-align:left">
                </div>
                <div>
                    <label style="font-size:0.8rem; color:var(--text-muted);">월</label>
                    <input type="number" id="set-month" value="${App.settings.month}" class="btn btn-outline btn-full" style="text-align:left">
                </div>
            </div>
            <div style="margin-top:15px;">
                <label style="font-size:0.8rem; color:var(--text-muted);">진행 상태</label>
                <select id="set-status" class="btn btn-outline btn-full" style="text-align:left">
                    <option value="open" ${App.settings.status === 'open' ? 'selected' : ''}>신청 중 (직원 달력 활성화)</option>
                    <option value="closed" ${App.settings.status === 'closed' ? 'selected' : ''}>신청 마감 (접근 불가)</option>
                    <option value="confirmed" ${App.settings.status === 'confirmed' ? 'selected' : ''}>확정 및 공지 (결과 노출)</option>
                </select>
            </div>
            <button class="btn btn-primary btn-full" style="margin-top:20px;" onclick="updateSettings()">설정 저장 및 적용</button>
        </div>

        <div class="card">
            <h3>📊 실시간 신청 현황</h3>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">
                총 ${App.employees.length}명 중 ${new Set(App.applications.map(a => a.name)).size}명 신청 완료
            </p>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>이름</th><th>신청 일수</th><th>상태</th></tr></thead>
                    <tbody>
                        ${App.employees.map(name => {
                            const count = App.applications.filter(a => a.name === name).length;
                            return `<tr>
                                <td>${name}</td>
                                <td>${count}일</td>
                                <td>${count > 0 ? '<span style="color:var(--success)">완료</span>' : '<span style="color:var(--danger)">미신청</span>'}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <button class="btn btn-primary btn-full" style="margin-top:20px;" onclick="runAutoAssign()">자동 배치 실행</button>
        </div>

        ${App.assignments.length > 0 ? `
        <div class="card">
            <h3>📋 배치 결과</h3>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">
                공란은 신청자가 없는 날짜예요. 수동 조정에서 직접 지정할 수 있어요.
            </p>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>날짜</th><th>근무자</th><th>상태</th></tr></thead>
                    <tbody>
                        ${App.assignments.map(a => `
                            <tr>
                                <td>${formatDateKR(a.date)}</td>
                                <td>${a.name || '—'}</td>
                                <td>${a.name ? '<span style="color:var(--success)">배치 완료</span>' : '<span style="color:var(--danger)">공란</span>'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <button class="btn btn-outline btn-full" style="margin-top:20px;" onclick="showManualAdjust()">수동 조정</button>
            <button class="btn btn-primary btn-full" style="margin-top:10px;" onclick="confirmAssign()">최종 확정</button>
        </div>
        ` : ''}
    `;
}

async function updateSettings() {
    const year = document.getElementById('set-year').value;
    const month = document.getElementById('set-month').value;
    const status = document.getElementById('set-status').value;
    if (!confirm(`${year}년 ${month}월 설정을 저장하시겠습니까?`)) return;
    try {
        const res = await SheetsAPI.saveSettings({ year, month, status });
        if(res.success) {
            alert('설정이 성공적으로 저장되었습니다.');
            location.reload();
        }
    } catch (e) {
        alert('저장에 실패했습니다.');
    }
}

async function runAutoAssign() {
    if (!confirm('자동 배치를 실행하시겠습니까?')) return;
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '배치 중... 잠시만 기다려주세요 ⏳';
    try {
        const res = await SheetsAPI.runAutoAssign();
        if (res.success) {
            alert('자동 배치가 완료되었습니다.');
            location.reload();
        } else {
            alert('배치 중 오류가 발생했습니다: ' + (res.error || ''));
            btn.disabled = false;
            btn.textContent = '자동 배치 실행';
        }
    } catch(e) {
        alert('배치에 실패했습니다. 다시 시도해주세요.');
        btn.disabled = false;
        btn.textContent = '자동 배치 실행';
    }
}

function showManualAdjust() {
    const container = document.getElementById('admin-content');
    container.innerHTML = `
        <div class="card">
            <h3>✏️ 수동 조정</h3>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">각 날짜의 근무자를 직접 변경할 수 있어요.</p>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>날짜</th><th>근무자</th></tr></thead>
                    <tbody>
                        ${App.assignments.map((a, i) => `
                            <tr>
                                <td>${formatDateKR(a.date)}</td>
                                <td>
                                    <select class="btn btn-outline" style="width:100%;" data-date="${a.date}" onchange="updateManualAssign(this)">
                                        <option value="">— 공란 —</option>
                                        ${App.employees.map(name =>
                                            `<option value="${name}" ${a.name === name ? 'selected' : ''}>${name}</option>`
                                        ).join('')}
                                    </select>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <button class="btn btn-outline btn-full" style="margin-top:20px;" onclick="renderAdminScreen()">← 돌아가기</button>
        </div>
    `;
}

async function updateManualAssign(select) {
    const date = select.dataset.date;
    const name = select.value;
    try {
        await SheetsAPI.saveManualAssign({ date, name });
        const assignment = App.assignments.find(a => a.date === date);
        if (assignment) assignment.name = name;
    } catch(e) {
        alert('저장에 실패했습니다.');
    }
}

async function confirmAssign() {
    if (!confirm('최종 확정하시겠습니까? 근무 이력에 누적 저장됩니다.')) return;
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '확정 중... 잠시만 기다려주세요 ⏳';
    try {
        const res = await SheetsAPI.confirmAssign();
        if (res.success) {
            await SheetsAPI.saveSettings({
                year: App.settings.year,
                month: App.settings.month,
                status: 'confirmed'
            });
            alert('최종 확정되었습니다. 직원들이 결과를 볼 수 있습니다.');
            location.reload();
        } else {
            alert('확정 중 오류가 발생했습니다.');
            btn.disabled = false;
            btn.textContent = '최종 확정';
        }
    } catch(e) {
        alert('확정에 실패했습니다.');
        btn.disabled = false;
        btn.textContent = '최종 확정';
    }
}

function logout() {
    if(confirm('로그아웃 하시겠습니까?')) {
        location.reload();
    }
}
