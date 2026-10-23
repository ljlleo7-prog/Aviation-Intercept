const DEG = Math.PI / 180;
const smoothstep = (value, min, max) => { const x = Math.max(0, Math.min(1, (value - min) / (max - min))); return x * x * (3 - 2 * x); };
export function cockpitVisualState(systems = {}, weather = {}) {
  const electrical = systems.electrical;
  const dc = (electrical?.dcVolts ?? 0) > 20;
  const ac = (electrical?.acVolts ?? 0) > 100;
  const code = Number(weather.weatherCode ?? weather.weather_code ?? 0);
  const snow = [71, 73, 75, 77, 85, 86].includes(code) || Number(weather.snowfall) > 0;
  const wet = snow || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code) || Number(weather.precipitation) > 0;
  const intensity = wet ? Math.min(1, Math.max(.25, Number(weather.precipitation || 1) / 5)) : 0;
  const on = value => value === true || (typeof value === 'number' && value > 0) || ['ON', 'LOW', 'HIGH', 'AUTO', 'TAXI', 'TO', 'TAKEOFF'].includes(String(value).toUpperCase());
  const lighting = systems.lighting || {};
  return {
    displaysPowered: electrical ? ac || dc : true,
    taxi: ac && on(lighting.taxi), landing: ac && on(lighting.landing),
    beacon: dc && on(lighting.beacon), strobe: ac && on(lighting.strobe),
    nav: dc && on(lighting.nav), wing: ac && on(lighting.wing), logo: ac && on(lighting.logo),
    background: dc && on(lighting.background), flood: dc && on(lighting.flood),
    panel: dc && on(lighting.panel), dome: dc && on(lighting.dome),
    leftWiper: ac && on(systems.wipers?.left), rightWiper: ac && on(systems.wipers?.right),
    snow, intensity,
    visibilityLimit: wet ? (snow ? 3500 : 7000) / (1 + intensity * 2) : Infinity,
  };
}
export const parseZuluTime = (selectedTime, weatherTime) => {
  const raw = selectedTime || weatherTime;
  if (typeof raw === 'string' && /^\d{1,2}:\d{2}Z?$/i.test(raw)) {
    const [hours, minutes] = raw.replace(/Z$/i, '').split(':').map(Number);
    const date = new Date(); date.setUTCHours(hours, minutes, 0, 0); return date;
  }
  const parsed = raw ? new Date(raw) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : new Date();
};

export const daylightFactor = (date, latitude, longitude) => {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000;
  const declination = 23.44 * DEG * Math.sin((2 * Math.PI * (day - 81)) / 365.25);
  const solarHour = date.getUTCHours() + date.getUTCMinutes() / 60 + longitude / 15;
  const hourAngle = (solarHour - 12) * 15 * DEG;
  const lat = latitude * DEG;
  const elevation = Math.asin(Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)) / DEG;
  return smoothstep(elevation, -6, 7);
};
