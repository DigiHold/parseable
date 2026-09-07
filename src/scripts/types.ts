export type TemplateId = 'classic' | 'compact' | 'open' | 'editorial' | 'mono' | 'signal' | 'portrait';
export const TEMPLATE_IDS: readonly TemplateId[] = ['classic', 'compact', 'open', 'editorial', 'mono', 'signal', 'portrait'];

export interface ResumeLink { label: string; url: string; }
export interface SkillRow { label: string; items: string; }
export interface Role { title: string; org: string; dates: string; bullets: string[]; env: string; }
export interface Project { name: string; meta: string; subtitle: string; bullets: string[]; env: string; }
export interface Education { degree: string; school: string; dates: string; detail: string; }

export interface Resume {
  schema: 'ats-resume-builder/v1';
  basics: {
    name: string; title: string; email: string; phone: string; location: string;
    links: ResumeLink[]; photo: string | null; summary: string;
  };
  skills: SkillRow[];
  experience: Role[];
  projects: Project[];
  education: Education[];
  languages: string;
  settings: { template: TemplateId; showPhoto: boolean };
}

export const emptyResume = (): Resume => ({
  schema: 'ats-resume-builder/v1',
  basics: { name: '', title: '', email: '', phone: '', location: '', links: [], photo: null, summary: '' },
  skills: [],
  experience: [],
  projects: [],
  education: [],
  languages: '',
  settings: { template: 'classic', showPhoto: false },
});

/** Accepts an export from any older version and fills what is missing. */
export function normalise(raw: unknown): Resume {
  const base = emptyResume();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, any>;
  const src = r.basics ?? r.profile ?? {};
  return {
    schema: 'ats-resume-builder/v1',
    basics: {
      name: str(src.name), title: str(src.title), email: str(src.email),
      phone: str(src.phone), location: str(src.location), summary: str(src.summary),
      photo: typeof src.photo === 'string' && src.photo.startsWith('data:image/') ? src.photo : null,
      links: arr(src.links).map((l: any) => ({ label: str(l?.label), url: str(l?.url) })).filter((l) => l.url),
    },
    skills: arr(r.skills).map((s: any) => ({ label: str(s?.label), items: str(s?.items) })),
    experience: arr(r.experience).map((e: any) => ({
      title: str(e?.title), org: str(e?.org), dates: str(e?.dates), env: str(e?.env), bullets: bullets(e?.bullets),
    })),
    projects: arr(r.projects).map((p: any) => ({
      name: str(p?.name), meta: str(p?.meta), subtitle: str(p?.subtitle), env: str(p?.env), bullets: bullets(p?.bullets),
    })),
    education: arr(r.education).map((e: any) => ({
      degree: str(e?.degree), school: str(e?.school), dates: str(e?.dates), detail: str(e?.detail),
    })),
    languages: str(r.languages),
    settings: {
      template: TEMPLATE_IDS.includes(r?.settings?.template) ? r.settings.template : 'classic',
      showPhoto: r?.settings?.showPhoto === true,
    },
  };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const bullets = (v: unknown): string[] => arr(v).map(str).filter(Boolean);
