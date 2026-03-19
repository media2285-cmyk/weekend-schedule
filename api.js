// Google Apps Script 웹앱 통신 모듈
const SheetsAPI = {
    // Apps Script 웹앱 URL (배포 후 여기에 입력)
    webAppUrl: CONFIG.WEB_APP_URL,

    async _call(action, data) {
        let url = `${this.webAppUrl}?action=${action}`;
        if (data) url += `&data=${encodeURIComponent(JSON.stringify(data))}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`요청 실패: ${res.status}`);
        const result = await res.json();
        if (result.error) throw new Error(result.error);
        return result;
    },

    async getSettings() {
        return this._call('getSettings');
    },

    async getEmployees() {
        return this._call('getEmployees');
    },

    async getApplications() {
        return this._call('getApplications');
    },

    async getAssignments() {
        return this._call('getAssignments');
    },

    async getHistory() {
        return this._call('getHistory');
    },

    async saveSettings(data) {
        return this._call('saveSettings', data);
    },

    async saveApplication(data) {
        return this._call('saveApplication', data);
    },

    async saveAssignments(data) {
        return this._call('saveAssignments', data);
    },

    async saveHistory(data) {
        return this._call('saveHistory', data);
    },

    async clearApplications() {
        return this._call('clearApplications');
    },

    async clearAssignments() {
        return this._call('clearAssignments');
    }
};
