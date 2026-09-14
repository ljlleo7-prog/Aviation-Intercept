const CACHE_KEY = 'skylinetragedy_failure_graph_cache_v2';

class FailureGraphCache {
    load() {
        if (typeof window === 'undefined') return null;
        try {
            const raw = window.localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.failures || !parsed.edges || !parsed.symptoms) return null;
            return parsed;
        } catch (error) {
            return null;
        }
    }

    save(data) {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch (error) {
            return;
        }
    }

    clear() {
        if (typeof window === 'undefined') return;
        window.localStorage.removeItem(CACHE_KEY);
    }
}

export const failureGraphCache = new FailureGraphCache();
