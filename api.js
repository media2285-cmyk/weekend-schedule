const SheetsAPI = {
    async getFullData() {
        try {
            const response = await fetch(`${CONFIG.WEB_APP_URL}?action=getAllData`);
            if (!response.ok) throw new Error('네트워크 응답 불안정');
            return await response.json();
        } catch (e) {
            console.error('데이터 로드 실패:', e);
            return { error: e.message };
        }
    },
    async saveApplication(data) {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=saveApplication&data=${encodeURIComponent(JSON.stringify(data))}`);
        return await response.json();
    },
    async saveSettings(data) {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=saveSettings&data=${encodeURIComponent(JSON.stringify(data))}`);
        return await response.json();
    },
    async runAutoAssign() {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=runAutoAssign`);
        return await response.json();
    },
    async saveManualAssign(data) {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=saveManualAssign&data=${encodeURIComponent(JSON.stringify(data))}`);
        return await response.json();
    },
    async confirmAssign() {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=confirmAssign`);
        return await response.json();
    }
};
