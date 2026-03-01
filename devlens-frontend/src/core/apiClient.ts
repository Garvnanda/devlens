const BASE_URL = '/api/v1'; // Proxy or exact backend URL should go here

export const apiClient = {
    get: async (endpoint: string) => {
        const res = await fetch(`${BASE_URL}${endpoint}`);
        if (!res.ok) throw new Error(`API GET failed: ${endpoint}`);
        return res.json();
    },
    post: async (endpoint: string, body?: any) => {
        const res = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) throw new Error(`API POST failed: ${endpoint}`);

        // For ingest, we might need text stream instead of json, but we'll stick to json for simplicity unless specified
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return res.json();
        }
        return res.text();
    }
};
