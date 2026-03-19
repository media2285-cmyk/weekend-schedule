// Google Sheets API 통신 모듈
const SheetsAPI = {
    baseUrl: 'https://sheets.googleapis.com/v4/spreadsheets',

    // 인증 파라미터 (토큰 있으면 OAuth, 없으면 API 키)
    _authParam() {
        const token = this.getToken();
        if (token) return '';
        return `key=${CONFIG.API_KEY}`;
    },

    _headers() {
        const token = this.getToken();
        const h = { 'Content-Type': 'application/json' };
        if (token) h['Authorization'] = `Bearer ${token}`;
        return h;
    },

    _addAuth(url) {
        const auth = this._authParam();
        if (!auth) return url;
        return url + (url.includes('?') ? '&' : '?') + auth;
    },

    // 시트 데이터 읽기
    async read(sheetName, range) {
        const fullRange = range ? `${sheetName}!${range}` : sheetName;
        let url = `${this.baseUrl}/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(fullRange)}`;
        url = this._addAuth(url);
        const res = await fetch(url, { headers: this._headers() });
        if (!res.ok) throw new Error(`시트 읽기 실패: ${res.status}`);
        const data = await res.json();
        return data.values || [];
    },

    // 시트 데이터 쓰기
    async write(sheetName, range, values) {
        const fullRange = `${sheetName}!${range}`;
        let url = `${this.baseUrl}/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(fullRange)}?valueInputOption=USER_ENTERED`;
        url = this._addAuth(url);
        const res = await fetch(url, {
            method: 'PUT',
            headers: this._headers(),
            body: JSON.stringify({ values })
        });
        if (!res.ok) throw new Error(`시트 쓰기 실패: ${res.status}`);
        return res.json();
    },

    // 시트 데이터 추가
    async append(sheetName, values) {
        let url = `${this.baseUrl}/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        url = this._addAuth(url);
        const res = await fetch(url, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify({ values })
        });
        if (!res.ok) throw new Error(`시트 추가 실패: ${res.status}`);
        return res.json();
    },

    // 시트 데이터 삭제 (범위 클리어)
    async clear(sheetName, range) {
        const fullRange = range ? `${sheetName}!${range}` : sheetName;
        let url = `${this.baseUrl}/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(fullRange)}:clear`;
        url = this._addAuth(url);
        const res = await fetch(url, {
            method: 'POST',
            headers: this._headers()
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
