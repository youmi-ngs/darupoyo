// そ〜しんちゅ〜: a little animation over a card while a record is being sent. It stays long
// enough to be seen even when sending is quick. Used by every post (chores, だるぽよ, うちらのなう).
export async function whileSending(host, work, min = 900) {
  const veil = document.createElement('div'); veil.className = 'sending-veil'; veil.setAttribute('role', 'status');
  veil.innerHTML = '<b>そ〜しんちゅ〜</b><span class="sending-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="sending-bar" aria-hidden="true"><i></i></span>';
  host.classList.add('is-sending'); host.append(veil);
  try { const [result] = await Promise.all([work(), new Promise(resolve => setTimeout(resolve, min))]); return result; }
  finally { veil.remove(); host.classList.remove('is-sending'); }
}
