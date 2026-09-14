const CACHE_KEY = 'skylinetragedy_narrative_cache_v1';

class NarrativeCache {
    load() {
        if (typeof window === 'undefined') return null;
        try {
            const raw = window.localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.narratives) return null;
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

export const narrativeCache = new NarrativeCache();
