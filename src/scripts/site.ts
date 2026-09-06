/* Page behaviour outside the wizard: reveals, the FAQ index, the sticky how it works. */

export function mountSite(): void {
  // The lit sheet loads after first paint, and only where WebGL exists.
  const host = document.querySelector<HTMLElement>('[data-hero-3d]');
  if (host && 'WebGLRenderingContext' in window) {
    const start = () => import('./hero3d').then((m) => m.mountHero(host)).catch(() => { /* the fallback stays */ });
    if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(start);
    else setTimeout(start, 200);
  }

  // The header is glass only once the page has moved under it.
  const head = document.querySelector<HTMLElement>('[data-head]');
  if (head) {
    const onScroll = () => head.classList.toggle('is-scrolled', window.scrollY > window.innerHeight * 0.85);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // How it works: the fragment on the right follows the step being read.
  const steps = document.querySelectorAll<HTMLElement>('[data-how-step]');
  const frags = document.querySelectorAll<HTMLElement>('[data-how-frag]');
  const show = (i: number) => {
    frags.forEach((f, k) => f.classList.toggle('is-active', k === i));
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
  };
  if (steps.length) {
    show(0);
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (hit) show(Number((hit.target as HTMLElement).dataset.howStep));
    }, { rootMargin: '-38% 0px -42% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });
    steps.forEach((s) => io.observe(s));
  }

}
