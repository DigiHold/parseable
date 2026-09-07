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

  // The sheet on the stage turns toward the pointer, a little, and toward the reader as the stage leaves.
  const obj = document.querySelector<HTMLElement>('.scene .obj');
  let baseRy = -16; const baseRx = 4; let tiltX = 0; let tiltY = 0;
  const wide = () => window.innerWidth > 1023;
  const pose = () => {
    if (!obj || !wide()) return;
    obj.style.setProperty('--ry', `${(baseRy + tiltY).toFixed(2)}deg`);
    obj.style.setProperty('--rx', `${(baseRx + tiltX).toFixed(2)}deg`);
  };
  if (obj && !reduce && window.matchMedia('(hover: hover)').matches) {
    window.addEventListener('pointermove', (e) => {
      tiltY = ((e.clientX / window.innerWidth) * 2 - 1) * 3;
      tiltX = -((e.clientY / window.innerHeight) * 2 - 1) * 2;
      pose();
    }, { passive: true });
  }

  // The light reads the sheet one line at a time and only ever rests in the gap between two lines.
  // On load it drops onto the page and reads the header; the scroll hands it the rest.
  const stage = document.querySelector<HTMLElement>('[data-stage]');
  const sceneEl = document.querySelector<HTMLElement>('.scene');
  if (stage && sceneEl) {
    sceneEl.style.animation = 'none';
    const sheet = sceneEl.querySelector<HTMLElement>('.face-human .sheet');
    const count = sceneEl.querySelector<HTMLElement>('[data-role="lines-read"]');
    let gaps: number[] = [0, 100];
    const topIn = (el: HTMLElement, root: HTMLElement) => {
      let y = 0; let n: HTMLElement | null = el;
      while (n && n !== root) { y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
      return y;
    };
    const measure = () => {
      if (!sheet) return;
      const H = sheet.offsetHeight; if (!H) return;
      const rows = Array.from(sheet.querySelectorAll<HTMLElement>('h1, h2, p, li'))
        .map((el) => { const top = topIn(el, sheet); return { top, bottom: top + el.offsetHeight }; })
        .filter((r) => r.bottom > r.top).sort((a, b) => a.top - b.top);
      const out: number[] = []; let prevBottom = 0;
      for (const r of rows) {
        if (r.top < prevBottom - 1) { prevBottom = Math.max(prevBottom, r.bottom); continue; }
        out.push(((prevBottom + r.top) / 2 / H) * 100); prevBottom = r.bottom;
      }
      out.push(((prevBottom + 6) / H) * 100);
      if (out.length > 1) gaps = out;
    };
    const REST = 3;
    const setAt = (i: number) => {
      sceneEl.style.setProperty('--scan', `${gaps[i].toFixed(2)}%`);
      if (count) count.textContent = `${i} of ${gaps.length - 1} lines read`;
    };
    const vars = { p: 0 };
    const apply = () => {
      const last = gaps.length - 1;
      setAt(last > REST ? REST + Math.round(vars.p * (last - REST)) : Math.round(vars.p * last));
    };
    measure();
    window.addEventListener('resize', () => { measure(); apply(); }, { passive: true });
    const ready: Promise<unknown> = document.fonts ? document.fonts.ready : Promise.resolve();
    if (reduce) {
      apply(); ready.then(() => { measure(); apply(); });
    } else {
      setAt(0);
      ready.then(() => {
        measure(); setAt(0);
        sceneEl.style.transition = '--scan 1.1s cubic-bezier(.2,.7,.2,1)';
        let i = 0;
        const step = () => { i += 1; setAt(Math.min(i, REST)); if (i < REST) window.setTimeout(step, 340); };
        window.setTimeout(step, 250);
        window.setTimeout(() => {
          sceneEl.style.transition = '';
          gsap.registerPlugin(ScrollTrigger);
          // Wide screens hold the stage for one screen of scroll while the light reads; phones read on the way past.
          const rot = { t: 0 };
          const turn = () => { baseRy = -16 + 11 * rot.t; pose(); };
          if (wide()) {
            const tl = gsap.timeline({ scrollTrigger: { trigger: stage, start: 'top top', end: '+=640', pin: true, scrub: 0.5 } });
            tl.to(vars, { p: 1, ease: 'none', onUpdate: apply }, 0).to(rot, { t: 1, ease: 'none', onUpdate: turn }, 0);
          } else {
            gsap.to(vars, { p: 1, ease: 'none', onUpdate: apply, scrollTrigger: { trigger: sceneEl, start: 'top 60%', end: 'bottom 40%', scrub: 0.5 } });
          }
          gsap.utils.toArray<HTMLElement>('.notes-row li, .steps-row li').forEach((el, k) => {
            gsap.from(el, { y: 18, opacity: 0, duration: .7, ease: 'power2.out', delay: (k % 4) * 0.08, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
          });
        }, 250 + 340 * REST + 400);
      });
    }
  }

  // The header is light on the dark stage, then turns solid and dark on the page below it.
  const head = document.querySelector<HTMLElement>('[data-head]');
  if (head) {
    const onScroll = () => {
      const y = window.scrollY;
      const box = stage && stage.parentElement && stage.parentElement.classList.contains('pin-spacer') ? stage.parentElement : stage;
      head.classList.toggle('is-dark', box ? y < box.offsetTop + box.offsetHeight - 64 : false);
      head.classList.toggle('is-scrolled', y > 24);
    };
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
