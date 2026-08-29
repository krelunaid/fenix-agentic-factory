const source = document.querySelector('[data-fenix-source]');
window.parent?.postMessage({ type: 'fenix:preview-ready', source: source?.getAttribute('data-fenix-source') ?? null }, '*');
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-fenix-source]') : null;
  if (target) window.parent?.postMessage({ type: 'fenix:select', source: target.getAttribute('data-fenix-source') }, '*');
});
