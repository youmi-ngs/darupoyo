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

function startWeather() {
  let busy = false, refreshed = 0;
  const refresh = async () => {
    if (busy || document.hidden || Date.now() - refreshed < 15 * 60 * 1000) return;
    busy = true; refreshed = Date.now();
    try {
      // #125: Google's Weather API through our server (the key stays there). Fixed Tokyo
      // location; no device location is requested or stored. Needs a signed-in resident.
      const { api } = await import('./api.js'); // loaded lazily so this module stays plain for unit tests
      const { kind } = await api('/weather');
      if (!['clear', 'cloudy', 'rain', 'snow'].includes(kind)) throw new Error('invalid weather');
      document.body.dataset.weather = kind;
    } catch {
      delete document.body.dataset.weather;
    } finally { busy = false; }
  };
  // The weather needs a signed-in resident, so it starts once they are in the house.
  window.addEventListener('darupoyo:entered', () => { refreshed = 0; void refresh(); });
  setInterval(refresh, 15 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
}
