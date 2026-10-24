const finite = value => typeof value === 'number' && Number.isFinite(value);

export function formatBriefingWeather(weather = {}) {
  const turbulence = weather.turbulence;
  let turbulenceKey = 'unavailable';
  if (finite(turbulence)) {
    turbulenceKey = turbulence <= 0 ? 'none' : turbulence < 0.3 ? 'light' : turbulence < 0.7 ? 'moderate' : 'severe';
  } else if (['none', 'light', 'moderate', 'severe', 'extreme'].includes(turbulence?.toLowerCase?.())) {
    turbulenceKey = turbulence.toLowerCase();
  }
  return {
    windSpeed: finite(weather.windSpeed) ? Math.max(0, weather.windSpeed).toFixed(0) : '—',
    visibilityKm: finite(weather.visibility) ? (Math.max(0, weather.visibility) / 1000).toFixed(1) : '—',
    cloudCover: finite(weather.cloudCover) ? Math.min(100, Math.max(0, weather.cloudCover)).toFixed(0) : '—',
    turbulenceKey
  };
}
