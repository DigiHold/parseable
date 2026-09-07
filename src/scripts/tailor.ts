/**
 * Tailors a resume to one posting without writing a word of it.
 *
 * Everything here is a reorder of what the person wrote: skill groups, the terms
 * inside them and the bullets of each role move so the ones the posting scores
 * come first, because placement is the second thing a requisition scores after
 * presence. The one line of text that changes is the job title, which takes the
 * posting's wording, because a title is how a role is named, not a fact to verify.
 * Nothing verifiable is touched: no degree, employer, date or skill appears that the
 * person did not write. One snapshot undoes everything.
 */
import type { Resume } from './types';
import type { Audit } from './keywords';
import { norm, present } from './keywords';

export interface TailorLog { title: boolean; skillGroups: number; skillItems: number; bullets: number; }

const ROLE_WORD = /\b(engineer|developer|designer|manager|lead|architect|analyst|scientist|consultant|specialist|director|head|intern|administrator|technician|marketer|writer|recruiter|accountant|officer|coordinator|assistant|ingénieur|développeur|développeuse|chef|responsable|concepteur|conceptrice|analyste|stagiaire|alternant|alternante)\b/i;

/* What job boards bolt onto a title and a resume should never repeat: contract, place, gender markers, urgency. */
const TAG_WORD = /\b(remote|hybrid|on[- ]?site|full[- ]?time|part[- ]?time|permanent|contract|contractor|freelance|temporary|internship|apprenticeship|cdi|cdd|alternance|stage|t[ée]l[ée]travail|temps plein|temps partiel|urgent|new|immediate start|asap|h\/f|f\/h|m\/f|f\/m|m\/w\/d|w\/m\/d|x\/f\/m|d\/f\/m|job|position|role|opening|vacancy|wanted|needed|hiring|poste|offre|emploi)\b/gi;
const PLACE_WORD = /\b(europe|emea|eu|uk|usa|us|france|switzerland|suisse|belgium|belgique|germany|allemagne|spain|espagne|italy|italie|portugal|netherlands|pays-bas|ireland|irlande|poland|pologne|austria|luxembourg|canada|quebec|paris|lyon|marseille|toulouse|bordeaux|nantes|lille|nice|montpellier|strasbourg|rennes|grenoble|london|berlin|munich|hamburg|amsterdam|rotterdam|madrid|barcelona|lisbon|lisbonne|dublin|zurich|geneva|gen[èe]ve|lausanne|bern|basel|brussels|bruxelles|milan|rome|warsaw|vienna|montreal|toronto|new york|nyc|sf|san francisco|austin|seattle|cet|cest|gmt|utc|est|pst)\b/gi;

/**
 * Turns "Full Stack Developer (France) - Remote H/F" into "Full Stack Developer".
 * Brackets go first, then the title keeps only its first segment that names a
 * role, then the board's tags and places are stripped from that segment.
 */
export function cleanTitle(raw: string): string {
  let t = raw.replace(/^\s*(job\s+title|title|poste|intitul[ée])\s*:\s*/i, '').replace(/\s*[(\[{][^)\]}]*[)\]}]/g, ' ').trim();
  const segments = t.split(/\s+(?:-|–|—|\||\/|@|at|chez|pour|for)\s+|\s*,\s*|\s*:\s*/i).map((x) => x.trim()).filter(Boolean);
  t = segments.find((x) => ROLE_WORD.test(x)) ?? segments[0] ?? '';
  t = t.replace(TAG_WORD, ' ').replace(PLACE_WORD, ' ').replace(/\b\d+\s*(k|€|\$|£)\b|[€$£]\s*\d+k?/gi, ' ');
  t = t.replace(/\s+/g, ' ').replace(/^[\s,;:\-–—/|]+|[\s,;:\-–—/|]+$/g, '').trim();
  return t.length >= 3 ? t : raw.trim();
}

/** The first line of a posting is its title on nearly every job board. */
export function guessTitle(posting: string): string {
  const first = posting.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  if (!first || first.length > 90 || /[.!?]$/.test(first)) return '';
  const clean = cleanTitle(first);
  return clean.length >= 4 && clean.length <= 60 && ROLE_WORD.test(clean) ? clean : '';
}

const hits = (text: string, terms: string[]): number => {
  const hay = norm(text);
  return terms.filter((t) => present(t, hay)).length;
};

/** A stable sort by weight, so ties keep the order the person chose. */
function byWeight<T>(list: T[], weight: (x: T) => number): T[] {
  return list.map((x, i) => ({ x, i, w: weight(x) })).sort((a, b) => b.w - a.w || a.i - b.i).map((a) => a.x);
}

export function tailor(data: Resume, a: Audit): TailorLog {
  const required = a.keywords.filter((k) => k.required).map((k) => k.term);
  const all = a.keywords.map((k) => k.term);
  const weight = (text: string) => hits(text, required) * 10 + hits(text, all);
  const log: TailorLog = { title: false, skillGroups: 0, skillItems: 0, bullets: 0 };

  if (a.title && !a.title.exact && norm(data.basics.title) !== norm(a.title.wanted)) {
    data.basics.title = a.title.wanted;
    log.title = true;
  }

  const groupsBefore = data.skills.map((row) => `${row.label}|${row.items}`);
  data.skills = byWeight(data.skills, (row) => weight(`${row.label} ${row.items}`));
  log.skillGroups = data.skills.filter((row, i) => `${row.label}|${row.items}` !== groupsBefore[i]).length;

  for (const row of data.skills) {
    const items = row.items.split(',').map((x) => x.trim()).filter(Boolean);
    if (items.length < 2) continue;
    const sorted = byWeight(items, weight);
    if (sorted.join(', ') !== items.join(', ')) { row.items = sorted.join(', '); log.skillItems++; }
  }

  for (const role of [...data.experience, ...data.projects]) {
    if (role.bullets.length < 2) continue;
    const sorted = byWeight(role.bullets, weight);
    if (sorted.join('\n') !== role.bullets.join('\n')) { role.bullets = sorted; log.bullets++; }
  }
  return log;
}

/** One line per change, written for the person, not for a log file. */
export function describe(log: TailorLog): string {
  const out: string[] = [];
  if (log.title) out.push('Your job title now reads as the posting writes it.');
  if (log.skillGroups) out.push(`${log.skillGroups} skill group${log.skillGroups > 1 ? 's' : ''} moved up so the ones it scores come first.`);
  if (log.skillItems) out.push(`Inside ${log.skillItems} group${log.skillItems > 1 ? 's' : ''} the scored terms now lead the list.`);
  if (log.bullets) out.push(`In ${log.bullets} role${log.bullets > 1 ? 's' : ''} the bullets carrying its terms now come first.`);
  return out.length ? out.join(' ') : 'Everything already sat where the software looks first, so nothing moved.';
}
