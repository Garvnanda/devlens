const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const TIMEOUT_MS = 30_000;
// Free-tier LLMs are slow: the Architect chains several calls (~90s), setup/intent ~15-75s.
const SLOW_ENDPOINTS: Record<string, number> = { '/chatbot': 180_000, '/setup/': 120_000, '/intent': 90_000, '/explain': 90_000, '/repository/vectorize': 180_000 };
const timeoutFor = (url: string) => Object.entries(SLOW_ENDPOINTS).find(([k]) => url.includes(k))?.[1] ?? TIMEOUT_MS;
const TOKEN_STORAGE_KEY = 'devlens_token';

/** Surface FastAPI's `detail` so the terminal shows why a call failed, not just the status. */
async function apiError(res: Response, endpoint: string): Promise<Error> {
    let detail = '';
    try {
        const body = await res.json();
        detail = typeof body.detail === 'string'
            ? body.detail
            : Array.isArray(body.detail) // FastAPI 422 validation errors
                ? body.detail.map((d: any) => String(d.msg).replace(/^Value error, /, '')).join('; ')
                : JSON.stringify(body.detail ?? body);
    } catch {
        // non-JSON error body
    }
    return new Error(detail ? `${detail} (HTTP ${res.status})` : `API error ${res.status}: ${endpoint}`);
}

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutFor(url));
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const headers = { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    return fetch(url, { ...options, headers, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const apiClient = {
    get: async (endpoint: string) => {
        let res: Response;
        try {
            res = await fetchWithTimeout(`${BASE_URL}${endpoint}`);
        } catch (err: any) {
            if (err.name === 'AbortError') throw new Error(`Request timed out: ${endpoint}`);
            throw new Error(`Network error: ${err.message}`);
        }
        if (!res.ok) throw await apiError(res, endpoint);
        return res.json();
    },
    post: async (endpoint: string, body?: any) => {
        let res: Response;
        try {
            res = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
            });
        } catch (err: any) {
            if (err.name === 'AbortError') throw new Error(`Request timed out: ${endpoint}`);
            throw new Error(`Network error: ${err.message}`);
        }
        if (!res.ok) throw await apiError(res, endpoint);
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return res.json();
        }
        return res.text();
    },

    // --- Phase 9: Identity Layer ---
    getMe: async () => apiClient.get('/auth/me'),
    updateProfile: async (update: { level?: string; language?: string; goal?: string }) =>
        apiClient.post('/auth/me', update),
    getSkillFingerprint: async () => apiClient.get('/auth/user/skill-fingerprint'),
    logout: async () => apiClient.post('/auth/logout'),
    githubLoginUrl: () => `${BASE_URL}/auth/github/login`,

    // --- Phase 6: Good First Issues & PR History ---
    getRecommendedIssues: async (owner: string, repo: string) => {
        return apiClient.get(`/issues/recommend/${owner}/${repo}`);
    },

    getPRHistory: async (owner: string, repo: string) => {
        return apiClient.get(`/history/${owner}/${repo}`);
    },

    // --- Phase 7: Gatekeeper ---
    getGatekeeperStatus: async (owner: string, repo: string) => {
        return apiClient.get(`/gatekeeper/${owner}/${repo}`);
    },

    // --- Phase 7/8: Architect Chatbot ---
    startMission: async (owner: string, repo: string, issueNumber: number, message: string, userProfile: any) => {
        return apiClient.post('/chatbot', {
            owner,
            repo,
            issue_number: issueNumber,
            message,
            user_profile: userProfile
        });
    },

    sendMissionUpdate: async (
        owner: string,
        repo: string,
        message: string,
        missionId: string,
        currentStep: number | null,
        type: 'user_chat' | 'terminal_output',
        userProfile: any
    ) => {
        return apiClient.post('/chatbot', {
            owner,
            repo,
            message,
            mission_id: missionId,
            current_step: currentStep,
            type,
            user_profile: userProfile
        });
    }
};
