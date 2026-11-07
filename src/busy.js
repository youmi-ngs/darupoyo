// #144: a button shows a small spinner and what is happening while it waits for the
// network (uploading, sharing, checking), so people know their tap went through.

export function setBusy(button, on, label) {
  if (!button) return;
  if (on) {
    if (!button.classList.contains('is-busy')) button.dataset.idleLabel = button.textContent;
    button.classList.add('is-busy'); button.setAttribute('aria-busy', 'true'); button.disabled = true;
    if (label) button.textContent = label;
  } else {
    button.classList.remove('is-busy'); button.removeAttribute('aria-busy');
    if (button.dataset.idleLabel !== undefined) { button.textContent = button.dataset.idleLabel; delete button.dataset.idleLabel; }
  }
}

// Runs work() with the button busy; the button comes back (enabled) afterwards.
export async function whileBusy(button, label, work) {
  setBusy(button, true, label);
  try { return await work(); } finally { setBusy(button, false); if (button) button.disabled = false; }
}
