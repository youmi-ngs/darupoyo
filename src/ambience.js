export function timeScene(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour < 5 || hour >= 19) return { period: 'night', sky: '#26365E', gradient: 'linear-gradient(#26365E, #69618D)' };
  if (hour < 7 || hour >= 16) return { period: 'twilight', sky: '#F6B8AE', gradient: 'linear-gradient(#B8AEDE, #FFC9AE)' };
  return { period: 'day', sky: '#CFE9FF', gradient: 'linear-gradient(#A8D8F5, #EDF8FF)' };
}
export function startAmbience() {
  const clock = document.querySelector('#room-clock');
  const update = () => {
    const now = new Date(), scene = timeScene(now);
    document.body.dataset.daylight = scene.period;
    document.body.style.setProperty('--window-sky', scene.sky);
    document.body.style.setProperty('--outdoor-sky', scene.gradient);
    clock?.setAttribute('aria-label', now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    clock?.querySelector('.clock-hour').setAttribute('transform', `rotate(${(now.getHours() % 12) * 30 + now.getMinutes() / 2} 15 15)`);
    clock?.querySelector('.clock-minute').setAttribute('transform', `rotate(${now.getMinutes() * 6} 15 15)`);
  };
  update(); setInterval(update, 30000);
  startWeather();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  const plan = document.querySelector('#plan');
  let prior = plan.scrollLeft, timeout;
  plan.addEventListener('scroll', () => {
    const delta = plan.scrollLeft - prior; prior = plan.scrollLeft;
    if (Math.abs(delta) < 2 || plan.classList.contains('is-swaying') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    plan.style.setProperty('--sway', `${delta > 0 ? -4 : 4}deg`);
    plan.classList.add('is-swaying'); clearTimeout(timeout);
    timeout = setTimeout(() => plan.classList.remove('is-swaying'), 650);
  }, { passive: true });
}

export function weatherKind(code) {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if (code >= 51) return 'rain';
  if (code >= 2) return 'cloudy';
  return 'clear';
}
function startWeather() {
  let busy = false, refreshed = 0;
  const refresh = async () => {
    if (busy || document.hidden || Date.now() - refreshed < 15 * 60 * 1000) return;
    busy = true; refreshed = Date.now();
    try {
      // Fixed Tokyo location; no device location is requested or stored.
      const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=35.68&longitude=139.76&current=weather_code', { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('weather unavailable');
      const code = (await response.json()).current?.weather_code;
      if (!Number.isInteger(code) || code < 0 || code > 99) throw new Error('invalid weather');
      document.body.dataset.weather = weatherKind(code);
    } catch {
      delete document.body.dataset.weather;
    } finally { busy = false; }
  };
  void refresh(); setInterval(refresh, 15 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
}
