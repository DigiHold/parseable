/* Page behaviour outside the wizard: reveals, the FAQ index, the sticky how it works. */

export function mountSite(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal on entry. One observer, one class, nothing that blocks reading.
  const revealed = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (reduce) revealed.forEach((el) => el.classList.add('is-in'));
  else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealed.forEach((el) => io.observe(el));
  }

  // FAQ: an index on the left drives one answer on the right. On small screens
  // the index is hidden and every answer stacks, so nothing depends on this.
  const qs = document.querySelectorAll<HTMLButtonElement>('[data-faq-q]');
  const as = document.querySelectorAll<HTMLElement>('[data-faq-a]');
  const pick = (i: number) => {
    qs.forEach((q, k) => q.setAttribute('aria-selected', String(k === i)));
    as.forEach((a, k) => a.classList.toggle('is-active', k === i));
  };
  qs.forEach((q, i) => q.addEventListener('click', () => pick(i)));
  if (qs.length) pick(0);

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

  // The 3D sheet loads after first paint, and only where WebGL exists.
  const host = document.querySelector<HTMLElement>('[data-hero-3d]');
  if (host && 'WebGLRenderingContext' in window) {
    const start = () => import('./hero3d').then((m) => m.mountHero(host)).catch(() => { /* the CSS fallback stays */ });
    if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(start);
    else setTimeout(start, 250);
  }
}
