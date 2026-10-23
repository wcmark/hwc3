// Shared by every web page, including pages without the main navigation.
function initBackToTop() {
  let button = document.querySelector('#backToTop');
  if (button?.dataset.backToTopReady) return;
  if (!button) {
    button = document.createElement('button');
    button.id = 'backToTop';
    button.textContent = '↑ Arriba';
    document.body.append(button);
  }
  button.dataset.backToTopReady = 'true';
  button.type = 'button';
  button.classList.add('btn', 'secondary', 'back-to-top');
  button.title = 'Volver arriba';
  button.setAttribute('aria-label', 'Volver arriba');
  button.hidden = true;

  // PPT has its own stylesheet; load this small shared style on every page.
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('../css/back-to-top.css', import.meta.url).href;
  let styled = false;
  function update() { button.hidden = !styled || window.scrollY <= 2; }
  stylesheet.addEventListener('load', () => { styled = true; update(); }, { once: true });
  document.head.append(stylesheet);

  button.addEventListener('click', () => window.scrollTo({
    top: 0,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
  }));
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  window.addEventListener('pageshow', update);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBackToTop, { once: true });
else initBackToTop();
