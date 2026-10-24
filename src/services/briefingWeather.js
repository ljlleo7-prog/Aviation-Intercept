export async function loadBriefingWeather(departure, {
  offlineMode, season, zuluTime, generateWeather, getWeather, timeoutMs = 8000
}) {
  const { latitude, longitude } = departure || {};
  if (![latitude, longitude].every(Number.isFinite)) return { source: 'unavailable' };
  const fallback = () => ({
    ...generateWeather(latitude, longitude, season, zuluTime),
    source: offlineMode ? 'simulated' : 'fallback'
  });
  if (offlineMode) return fallback();

  const controller = new AbortController();
  let timeout;
  try {
    const weather = await Promise.race([
      Promise.resolve().then(() => getWeather(latitude, longitude, { signal: controller.signal })),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error('Departure weather timed out'));
        }, timeoutMs);
      })
    ]);
    if (!weather || weather.source === 'fallback') return fallback();
    return { ...weather, season, zuluTime, latitude, longitude, source: 'live' };
  } catch {
    return fallback();
  } finally {
    clearTimeout(timeout);
  }
}
