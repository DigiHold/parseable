/**
 * Reads a job posting and works out which terms the screening software will
 * look for, then checks the resume against them.
 *
 * Everything here runs on the visible text. Nothing is ever hidden in the
 * output: a term the resume does not contain is reported as missing, and the
 * person decides whether it is true of them before it goes anywhere near the page.
 */

export interface Keyword { term: string; required: boolean; found: boolean; }
/** The posting's title against the resume: the exact phrase, and how many of its words appear at all. */
export interface TitleMatch { wanted: string; exact: boolean; words: number; wordsHit: number; }
export interface Audit {
  keywords: Keyword[];
  requiredTotal: number; requiredHit: number; requiredPct: number;
  preferredTotal: number; preferredHit: number;
  title: TitleMatch | null;
}

/* Terms an ATS requisition actually scores. Precision beats coverage here:
   a noisy extractor sends people chasing keywords that were never required. */
const DICTIONARY: string[] = [
  // languages
  'JavaScript','TypeScript','Python','Java','C#','C++','Go','Golang','Rust','PHP','Ruby','Swift','Kotlin','Scala','SQL','HTML','CSS','Bash','Shell','R','Perl','Elixir','Dart','Objective-C',
  // frontend
  'React','React Native','Next.js','Vue','Vue.js','Nuxt','Angular','Svelte','SvelteKit','Astro','Remix','Redux','Tailwind CSS','Tailwind','SASS','SCSS','Less','Webpack','Vite','Storybook','jQuery','Bootstrap','Material UI','shadcn/ui','Framer Motion','GSAP','Three.js','WebGL','Web Components','Accessibility','WCAG','Responsive design','Figma','Sketch','Adobe XD','Design systems',
  // backend
  'Node.js','Express','NestJS','Fastify','Django','Flask','FastAPI','Laravel','Symfony','Rails','Spring','Spring Boot','.NET','ASP.NET','GraphQL','REST','REST API','gRPC','WebSockets','Microservices','Serverless','Message queue','RabbitMQ','Kafka','Celery','Cron',
  // data
  'PostgreSQL','Postgres','MySQL','MariaDB','SQLite','MongoDB','Redis','Elasticsearch','DynamoDB','Cassandra','Snowflake','BigQuery','Redshift','Databricks','Prisma','Drizzle','SQLAlchemy','TypeORM','ETL','Data pipeline','Data modeling','Data warehouse','dbt','Airflow',
  // cloud and ops
  'AWS','Azure','GCP','Google Cloud','Cloudflare','Cloudflare Workers','Vercel','Netlify','Heroku','Docker','Kubernetes','K8s','Terraform','Ansible','Pulumi','CI/CD','GitHub Actions','GitLab CI','Jenkins','CircleCI','Linux','Nginx','systemd','Git','GitHub','GitLab','Bitbucket','Monitoring','Observability','Datadog','Grafana','Prometheus','Sentry','Load balancing','Caching','CDN',
  // ai
  'Machine learning','Deep learning','LLM','Large language models','Generative AI','Prompt engineering','RAG','Retrieval augmented generation','Vector database','Pinecone','Weaviate','Embeddings','Fine-tuning','OpenAI','Anthropic','Claude','GPT','Gemini','LangChain','LlamaIndex','Hugging Face','PyTorch','TensorFlow','scikit-learn','Pandas','NumPy','NLP','Computer vision','MLOps','Model evaluation','AI agents','Agentic','Tool use','MCP','Model Context Protocol','Automation','Workflow automation','n8n','Zapier','Make.com',
  // product and practice
  'Agile','Scrum','Kanban','Jira','Confluence','Notion','Linear','Test driven development','TDD','Unit testing','Integration testing','End to end testing','Jest','Vitest','Playwright','Cypress','Selenium','PyTest','Code review','Pair programming','Technical documentation','System design','Architecture','Scalability','Performance optimization','Security','OAuth','SSO','SAML','JWT','Authentication','Authorization','GDPR','SOC 2','Penetration testing','Encryption',
  // business and marketing
  'SEO','Technical SEO','SEM','Google Analytics','Google Search Console','Google Tag Manager','A/B testing','Conversion rate optimization','Content marketing','Email marketing','HubSpot','Salesforce','Stripe','Shopify','WordPress','WooCommerce','Webflow','Contentful','Sanity','Headless CMS','E-commerce','Analytics','Product management','Roadmap','Stakeholder management','Cross functional','Mentoring','Team leadership','Customer facing','Technical writing','Public speaking',
  // ways of working
  'Remote','Fully remote','Hybrid','Distributed team','Asynchronous','English','French','German','Spanish','Dutch','Italian','Portuguese','Startup','B2B','B2C','SaaS','Freelance','Consulting',
];

/* Written differently in postings and in resumes. A hit on either form counts. */
const ALIASES: Record<string, string[]> = {
  'JavaScript': ['JS'], 'TypeScript': ['TS'], 'Kubernetes': ['K8s'], 'K8s': ['Kubernetes'],
  'PostgreSQL': ['Postgres'], 'Postgres': ['PostgreSQL'], 'Golang': ['Go'], 'Go': ['Golang'],
  'Node.js': ['NodeJS', 'Node'], 'Next.js': ['NextJS'], 'Vue.js': ['Vue'], 'Vue': ['Vue.js'],
  'CI/CD': ['CICD', 'continuous integration', 'continuous delivery'],
  'REST API': ['REST', 'RESTful'], 'REST': ['RESTful', 'REST API'],
  'Test driven development': ['TDD'], 'TDD': ['test driven development'],
  'Large language models': ['LLM', 'LLMs'], 'LLM': ['large language models'],
  'Google Cloud': ['GCP'], 'GCP': ['Google Cloud'], 'Tailwind CSS': ['Tailwind'],
  'Retrieval augmented generation': ['RAG'], 'RAG': ['retrieval augmented generation'],
  'Machine learning': ['ML'], 'Fully remote': ['remote', 'work from home'],
};

/* Headings that open a block of hard requirements, and the ones that open a wish list. */
const REQUIRED_HEADS = /^\s*(requirements?|qualifications?|what you (?:will |'ll )?need|must[- ]haves?|essential|who you are|we (?:are|'re) looking for|profil recherch|comp[ée]tences requises)/i;
const PREFERRED_HEADS = /^\s*(nice[- ]to[- ]haves?|preferred|bonus|plus(?:es)?|desirable|good to have|it would be great|un plus|appr[ée]ci[ée])/i;
const REQUIRED_CUE = /\b(must have|required|is required|you have|minimum|at least|\d+\+? years?|proven|strong (?:experience|background)|solid (?:experience|understanding)|essential)\b/i;
const PREFERRED_CUE = /\b(nice to have|bonus|a plus|preferred|ideally|desirable|familiarity|exposure to|would be great|appreciated)\b/i;

/* Phrases the posting names explicitly, caught even when they are not in the dictionary. */
const PHRASE_PATTERNS = [
  /\b(?:experience|expertise|proficiency|proficient|fluency|background|familiarity|knowledge)\s+(?:with|in|of|using)\s+([A-Za-z][A-Za-z0-9+#.\/ -]{2,38})/gi,
  /\b(?:working|hands[- ]on)\s+knowledge\s+of\s+([A-Za-z][A-Za-z0-9+#.\/ -]{2,38})/gi,
  /\bstrong\s+([A-Za-z][A-Za-z0-9+#.\/ -]{2,30}?)\s+skills\b/gi,
];

const STOP_TAIL = /\b(and|or|with|the|a|an|to|in|of|for|is|are|such as|including|etc|our|your|their)\b\s*$/i;


export const norm = (s: string) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');

/* One requirement must count once. A posting that says "Kubernetes" and a resume
   that says "K8s" are the same fact, so both collapse onto a single canonical term. */
const CANON_GROUPS: string[][] = [
  ['Kubernetes', 'K8s'], ['PostgreSQL', 'Postgres'], ['Go', 'Golang'], ['JavaScript', 'JS'],
  ['TypeScript', 'TS'], ['Node.js', 'NodeJS', 'Node'], ['Next.js', 'NextJS'], ['Vue', 'Vue.js'],
  ['CI/CD', 'CICD'], ['REST API', 'REST', 'RESTful'], ['Test driven development', 'TDD'],
  ['Large language models', 'LLM', 'LLMs'], ['Google Cloud', 'GCP'], ['Tailwind CSS', 'Tailwind'],
  ['Retrieval augmented generation', 'RAG'], ['Machine learning', 'ML'], ['Fully remote', 'Remote'],
];
const CANON = new Map<string, string>();
for (const group of CANON_GROUPS) for (const form of group) CANON.set(norm(form), group[0]);
const canonical = (term: string) => CANON.get(norm(term)) ?? term;

export function present(term: string, haystack: string): boolean {
  const forms = [term, ...(ALIASES[term] || [])];
  return forms.some((f) => {
    const p = norm(f).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    return new RegExp(`(?<![a-z0-9])${p}(?![a-z0-9])`, 'i').test(haystack);
  });
}

/** Splits the posting into blocks so a heading can govern the lines beneath it. */
function classify(posting: string): Map<string, boolean> {
  const verdict = new Map<string, boolean>();
  const lines = posting.split(/\r?\n/);
  let blockRequired: boolean | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const short = line.length < 70 && !/[.!?]$/.test(line);
    if (short && REQUIRED_HEADS.test(line)) { blockRequired = true; continue; }
    if (short && PREFERRED_HEADS.test(line)) { blockRequired = false; continue; }

    let isRequired: boolean;
    if (PREFERRED_CUE.test(line)) isRequired = false;
    else if (REQUIRED_CUE.test(line)) isRequired = true;
    else isRequired = blockRequired ?? true;

    const hay = norm(line);
    for (const term of DICTIONARY) {
      if (present(term, hay)) {
        // Required wins if a term shows up in both a requirement and a wish list.
        verdict.set(term, verdict.get(term) === true ? true : isRequired);
      }
    }
  }
  return verdict;
}

function phrases(posting: string): string[] {
  const found = new Map<string, string>();
  for (const re of PHRASE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(posting))) {
      // "Kubernetes and Docker" is two requirements, not one phrase.
      for (const raw of m[1].split(/\s*(?:,|\band\b|\bor\b)\s*/i)) {
        const p = raw.trim().replace(/[,.;:]+$/, '').replace(STOP_TAIL, '').trim();
        if (!p || p.length < 3 || p.split(/\s+/).length > 4) continue;
        // Anything the dictionary already names, or that merely wraps a dictionary
        // term in filler ("Python in production"), is dropped as a duplicate.
        if (DICTIONARY.some((d) => present(d, norm(p)))) continue;
        found.set(norm(p), p);
      }
    }
  }
  return [...found.values()].slice(0, 10);
}

export function audit(posting: string, resumeText: string, jobTitle = ''): Audit {
  const hay = norm(resumeText);

  // The title is the first field a requisition scores, so it is compared on its own, never buried in the list.
  const wanted = jobTitle.trim().replace(/\s+/g, ' ');
  let title: TitleMatch | null = null;
  if (wanted) {
    const words = wanted.split(' ').filter((w) => w.length > 1 && !/^(and|or|of|the|a|an|in|at|for|to|with|de|des|du|et|le|la|les)$/i.test(w));
    title = { wanted, exact: present(wanted, hay), words: words.length, wordsHit: words.filter((w) => present(w, hay)).length };
  }
  const raw = classify(posting);

  // Collapse alias families onto one term. Required beats preferred on a collision.
  const verdict = new Map<string, boolean>();
  for (const [term, required] of raw) {
    const key = canonical(term);
    verdict.set(key, verdict.get(key) === true ? true : required);
  }
  for (const p of phrases(posting)) if (!verdict.has(canonical(p))) verdict.set(canonical(p), true);

  const keywords: Keyword[] = [...verdict.entries()]
    .map(([term, required]) => ({ term, required, found: present(term, hay) }))
    .sort((a, b) => Number(b.required) - Number(a.required) || Number(a.found) - Number(b.found) || a.term.localeCompare(b.term));

  const req = keywords.filter((k) => k.required);
  const pref = keywords.filter((k) => !k.required);
  const reqHit = req.filter((k) => k.found).length;

  return {
    keywords,
    requiredTotal: req.length,
    requiredHit: reqHit,
    requiredPct: req.length ? Math.round((reqHit / req.length) * 100) : 0,
    preferredTotal: pref.length,
    preferredHit: pref.filter((k) => k.found).length,
    title,
  };
}
