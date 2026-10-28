export function setupPage() {
  document.body.classList.add('setup');
  document.querySelector('#setup').hidden = false;
  const form = document.querySelector('#settings');
  const preview = document.querySelector('#preview');
  const status = document.querySelector('#copy-status');
  const fallback = document.querySelector('#url-fallback');
  let timer;

  function overlayURL(mock = false) {
    const values = new FormData(form);
    const url = new URL(location.href);
    url.search = ''; url.hash = '';
    if (mock) url.searchParams.set('mock', '1');
    else url.searchParams.set('channel', String(values.get('channel')).trim().toLowerCase());
    url.searchParams.set('text', values.get('text') || 'BE RIGHT BACK');
    if (values.get('back') !== '') url.searchParams.set('back', values.get('back'));
    if (values.has('bg')) url.searchParams.set('bg', '1');
    if (values.has('sound')) url.searchParams.set('sound', '1');
    return url;
  }

  function refresh() {
    const url = overlayURL(true);
    document.querySelector('#demo-link').href = url.href;
    url.searchParams.set('ui', '0');
    preview.src = url.href;
  }
  form.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 300);
    status.textContent = 'No login. No tokens. Just your channel.';
    fallback.hidden = true;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const url = overlayURL().href;
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Copied. Your BRB scene is about to get busy.';
    } catch {
      fallback.value = url; fallback.hidden = false; fallback.focus(); fallback.select();
      status.textContent = 'Copy the selected URL below.';
    }
  });
  refresh();
}
