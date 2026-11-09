// Installation stays optional; the browser decides whether a native prompt is available.
export function setupInstallGuide() {
  const card = document.getElementById('install-card');
  const button = document.getElementById('install-app');
  const dialog = document.createElement('dialog');
  dialog.className = 'refined-modal install-guide';
  dialog.setAttribute('aria-labelledby', 'install-guide-title');
  const icon = paths => `<svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const share = icon('<path d="M9 12H5v16h22V12h-4M16 21V3m-6 6 6-6 6 6"/>');
  const add = icon('<rect x="4" y="4" width="24" height="24" rx="6"/><path d="M16 10v12m-6-6h12"/>');
  const menu = icon('<circle cx="16" cy="7" r="1.5"/><circle cx="16" cy="16" r="1.5"/><circle cx="16" cy="25" r="1.5"/>');
  const install = icon('<path d="M16 3v17m-6-6 6 6 6-6M5 22v6h22v-6"/>');
  const addressBar = icon('<rect x="2" y="7" width="28" height="18" rx="4"/><rect x="6" y="12" width="20" height="8" rx="4"/><path d="M10 16h8"/>');
  const phone = icon('<rect x="8" y="2" width="16" height="28" rx="4"/><path d="M13 6h6m-5 20h4"/>');
  const computer = icon('<rect x="2" y="4" width="28" height="19" rx="3"/><path d="M16 23v5m-6 0h12"/>');
  const devices = [['ios',phone,'iPhone・iPad','Safari'],['android',phone,'Android','Chrome'],['desktop',computer,'パソコン','Chrome・Edge']];
  const steps = items => `<ol class="install-steps">${items.map(([art, label],i) => `<li><span class="install-step-number">${i+1}</span><span class="install-step-icon">${art}</span><b>${label}</b></li>`).join('')}</ol>`;
  dialog.innerHTML = `<header class="refined-header"><h2 id="install-guide-title">ホーム画面に追加</h2><button class="refined-close" type="button" aria-label="閉じる"><img src="/refined/edfe8.svg" alt=""></button></header>
    <p class="refined-description">使っている端末を選んでね</p>
    <div class="install-device-picker" role="group" aria-label="端末を選ぶ">${devices.map(([id, art, name, browser]) => `<button type="button" class="install-device-button" data-choose="${id}" aria-pressed="false" aria-controls="install-device-${id}">${art}<b>${name}</b><small>${browser}</small></button>`).join('')}</div>
    <section class="install-device" data-device="ios" id="install-device-ios" hidden><h3>iPhone・iPad（Safari）</h3><p class="install-browser-note">Safariで開いて、この順にタップ</p>${steps([[share,'共有ボタン'],[add,'ホーム画面に追加']])}<p class="install-tip">「Webアプリとして開く」があればオンにしてね。</p></section>
    <section class="install-device" data-device="android" id="install-device-android" hidden><h3>Android（Chrome）</h3><p class="install-browser-note">Chromeで開いて、この順にタップ</p>${steps([[menu,'右上のメニュー'],[add,'ホーム画面に追加']])}</section>
    <section class="install-device" data-device="desktop" id="install-device-desktop" hidden><h3>パソコン（Chrome・Edge）</h3><p class="install-browser-note">画面上のアドレスバーを見てね</p>${steps([[addressBar,'アドレスバー'],[install,'インストールアイコン']])}</section>
    <p class="install-hint" hidden>見つからないときはSafari・Chromeで開き直してね。追加はあとでもOK♡</p>
    <p role="status" hidden></p><button type="button" class="refined-button" data-install hidden>ホーム画面に追加</button>`;
  document.body.append(dialog);
  const status = dialog.querySelector('[role=status]'), native = dialog.querySelector('[data-install]');
  const standalone = matchMedia('(display-mode: standalone)');
  const fullscreen = matchMedia('(display-mode: fullscreen)');
  let promptEvent = null, installed = false, selectedDevice = null, copy = '';
  function render() {
    // #177: the card always shows; on the home-screen app it says it is already added.
    const added = installed || standalone.matches || fullscreen.matches || navigator.standalone === true;
    card.classList.toggle('is-added', added);
    copy ||= card.querySelector('p').innerHTML;
    card.querySelector('p').innerHTML = added ? 'もうホーム画面に追加できてるよ♡<br>通知はマイページでオンにできるよ' : copy;
    button.hidden = added;
    native.hidden = !promptEvent || !selectedDevice || selectedDevice === 'ios'; native.disabled = false;
    dialog.querySelectorAll('[data-choose]').forEach(choice => choice.setAttribute('aria-pressed', String(choice.dataset.choose === selectedDevice)));
    dialog.querySelectorAll('[data-device]').forEach(panel => { panel.hidden = panel.dataset.device !== selectedDevice; });
    dialog.querySelector('.install-hint').hidden = !selectedDevice;
    if (button.hidden && dialog.open) dialog.close();
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); promptEvent = event; render();
  });
  window.addEventListener('appinstalled', () => { installed = true; promptEvent = null; render(); });
  standalone.addEventListener('change', render); fullscreen.addEventListener('change', render);
  dialog.querySelectorAll('[data-choose]').forEach(choice => {
    choice.onclick = () => { selectedDevice = choice.dataset.choose; status.hidden = true; render(); };
  });
  button.onclick = () => {
    selectedDevice = null;
    status.hidden = true; render(); dialog.showModal(); dialog.querySelector('.refined-close').focus();
  };
  native.onclick = async () => {
    const event = promptEvent; if (!event) return;
    promptEvent = null; native.disabled = true;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      status.textContent = choice.outcome === 'accepted' ? '追加が完了したら、ホーム画面のだるぽよを開いてね♡' : 'またいつでも追加できるよ♡';
    } catch { status.textContent = '上の手順から追加してみてね。'; }
    finally { status.hidden = false; render(); }
  };
  dialog.querySelector('.refined-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    (button.hidden ? document.getElementById('howto-title') : button).focus({ preventScroll: true });
  });
  render();
}
