const SheetsAPI = {
    // 통합 데이터 호출 (속도 최적화)
    async getFullData() {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=getAllData`);
        return await response.json();
    },

    async getSettings() {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=getSettings`);
        return await response.json();
    },

    async getEmployees() {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=getEmployees`);
        return await response.json();
    },

    async saveApplication(data) {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=saveApplication&data=${encodeURIComponent(JSON.stringify(data))}`);
        return await response.json();
    },

    async saveSettings(data) {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=saveSettings&data=${encodeURIComponent(JSON.stringify(data))}`);
        return await response.json();
    },

    async saveAssignments(data) {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=saveAssignments&data=${encodeURIComponent(JSON.stringify(data))}`);
        return await response.json();
    },

    async saveHistory(data) {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=saveHistory&data=${encodeURIComponent(JSON.stringify(data))}`);
        return await response.json();
    },

    async clearApplications() {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=clearApplications`);
        return await response.json();
    },

    async clearAssignments() {
        const response = await fetch(`${CONFIG.WEB_APP_URL}?action=clearAssignments`);
        return await response.json();
    }
};
