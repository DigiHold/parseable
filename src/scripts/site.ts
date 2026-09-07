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
      obj.style.transform = `translate(${mx * 6}px, ${my * 4}px)`;
    }, { passive: true });
  }

  // The stage answers the scroll: the seam walks down the sheet one line at a time,
  // and only ever rests in the gap between two lines, so no glyph is ever cut in half.
  const stage = document.querySelector<HTMLElement>('[data-stage]');
  const sceneEl = document.querySelector<HTMLElement>('.scene');
  if (stage && sceneEl && !reduce) {
    gsap.registerPlugin(ScrollTrigger);
    sceneEl.style.animation = 'none';
    const face = sceneEl.querySelector<HTMLElement>('.face-human');
    let gaps: number[] = [0, 100];
    const measure = () => {
      if (!face) return;
      const fr = face.getBoundingClientRect();
      const rows = Array.from(face.querySelectorAll<HTMLElement>('h1, h2, p, li'))
        .map((el) => el.getBoundingClientRect()).filter((r) => r.height > 0)
        .sort((a, b) => a.top - b.top);
      const out: number[] = [];
      let prevBottom = fr.top;
      for (const r of rows) {
        if (r.top < prevBottom - 1) { prevBottom = Math.max(prevBottom, r.bottom); continue; }
        out.push((((prevBottom + r.top) / 2 - fr.top) / fr.height) * 100);
        prevBottom = r.bottom;
      }
      out.push(((prevBottom + 6 - fr.top) / fr.height) * 100);
      if (out.length > 1) gaps = out;
    };
    const vars = { p: 0 };
    const apply = () => {
      const i = Math.round(vars.p * (gaps.length - 1));
      sceneEl.style.setProperty('--scan', `${gaps[i].toFixed(2)}%`);
    };
    measure(); apply();
    document.fonts?.ready.then(() => { measure(); apply(); });
    window.addEventListener('resize', () => { measure(); apply(); }, { passive: true });
    gsap.to(vars, { p: 1, ease: 'none', onUpdate: apply, scrollTrigger: { trigger: sceneEl, start: 'top 45%', end: 'bottom 45%', scrub: 0.5 } });
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
