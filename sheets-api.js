// Google Sheets API 통신 모듈
const SheetsAPI = {
    baseUrl: 'https://sheets.googleapis.com/v4/spreadsheets',

    // 시트 데이터 읽기
    async read(sheetName, range) {
        const fullRange = range ? `${sheetName}!${range}` : sheetName;
        const url = `${this.baseUrl}/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(fullRange)}?key=${CONFIG.API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`시트 읽기 실패: ${res.status}`);
        const data = await res.json();
        return data.values || [];
    },

    // 시트 데이터 쓰기 (OAuth 토큰 사용)
    async write(sheetName, range, values) {
        const fullRange = `${sheetName}!${range}`;
        const url = `${this.baseUrl}/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(fullRange)}?valueInputOption=USER_ENTERED`;
        const token = this.getToken();
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values })
        });
        if (!res.ok) throw new Error(`시트 쓰기 실패: ${res.status}`);
        return res.json();
    },

    // 시트 데이터 추가
    async append(sheetName, values) {
        const url = `${this.baseUrl}/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        const token = this.getToken();
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values })
        });
        if (!res.ok) throw new Error(`시트 추가 실패: ${res.status}`);
        return res.json();
    },

    // 시트 데이터 삭제 (범위 클리어)
    async clear(sheetName, range) {
        const fullRange = range ? `${sheetName}!${range}` : sheetName;
        const url = `${this.baseUrl}/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(fullRange)}:clear`;
        const token = this.getToken();
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) throw new Error(`시트 클리어 실패: ${res.status}`);
        return res.json();
    },

    // OAuth 토큰 관리
    getToken() {
        return localStorage.getItem('google_access_token') || '';
    },

    setToken(token) {
        localStorage.setItem('google_access_token', token);
    },

    // Google OAuth 로그인 (담당자 전용)
    async authenticate() {
        return new Promise((resolve, reject) => {
            // Google Identity Services 사용
            if (!window.google || !window.google.accounts) {
                reject(new Error('Google Identity Services가 로드되지 않았습니다.'));
                return;
            }
            const client = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID || '',
                scope: 'https://www.googleapis.com/auth/spreadsheets',
                callback: (response) => {
                    if (response.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    this.setToken(response.access_token);
                    resolve(response.access_token);
                }
            });
            client.requestAccessToken();
        });
    },

    // 토큰 유효성 확인
    async checkToken() {
        const token = this.getToken();
        if (!token) return false;
        try {
            const res = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
            return res.ok;
        } catch {
            return false;
        }
    }
};
