/* Page behaviour outside the wizard: reveals, the FAQ index, the sticky how it works. */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function mountSite(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal on entry, with a safety net so nothing ever depends on an observer firing.
  const revealed = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (reduce) revealed.forEach((el) => el.classList.add('is-in'));
  else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });
    revealed.forEach((el) => io.observe(el));
    window.setTimeout(() => revealed.forEach((el) => el.classList.add('is-in')), 1500);
  }

  // The sheet on the stage turns toward the pointer, a little.
  const obj = document.querySelector<HTMLElement>('.scene .obj');
  if (obj && !reduce && window.matchMedia('(hover: hover)').matches) {
    const scene = obj.parentElement as HTMLElement;
    window.addEventListener('pointermove', (e) => {
      const r = scene.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const my = ((e.clientY - r.top) / r.height) * 2 - 1;
      obj.style.setProperty('--ry', `${-17 + mx * 7}deg`);
      obj.style.setProperty('--rx', `${3 - my * 4}deg`);
    }, { passive: true });
  }

  // The stage answers the scroll: the blade sweeps the page as the reader moves,
  // and the sheet turns to face the reader as the stage leaves the viewport.
  const stage = document.querySelector<HTMLElement>('[data-stage]');
  const sceneEl = document.querySelector<HTMLElement>('.scene');
  if (stage && sceneEl && !reduce) {
    gsap.registerPlugin(ScrollTrigger);
    sceneEl.style.animation = 'none';
    const vars = { scan: 30 };
    const apply = () => sceneEl.style.setProperty('--scan', `${vars.scan}%`);
    apply();
    gsap.to(vars, { scan: 96, ease: 'none', onUpdate: apply, scrollTrigger: { trigger: stage, start: 'top 60%', end: 'bottom 20%', scrub: 0.6 } });
    const objEl = sceneEl.querySelector<HTMLElement>('.obj');
    if (objEl) gsap.to(objEl, { '--ry': '-4deg', '--rx': '0deg', ease: 'none', scrollTrigger: { trigger: stage, start: 'top top', end: 'bottom 30%', scrub: 0.8 } });
    gsap.utils.toArray<HTMLElement>('.notes-row li, .steps-row li').forEach((el, i) => {
      gsap.from(el, { y: 18, opacity: 0, duration: .7, ease: 'power2.out', delay: (i % 4) * 0.08, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });
  }

  // The header is glass only once the page has moved under it.
  const head = document.querySelector<HTMLElement>('[data-head]');
  if (head) {
    const onScroll = () => head.classList.toggle('is-scrolled', window.scrollY > 24);
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
