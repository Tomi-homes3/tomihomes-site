// Tomi Homes blog builder.
// Netlify runs this on every deploy. It reads each post in /posts (written by Zapier),
// turns it into a page that matches the rest of the site, and refreshes the cards on blog.html.
// No extra software needed: plain Node.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'posts');
const TEMPLATE = path.join(ROOT, 'blog-template.html');
const BLOG_PAGE = path.join(ROOT, 'blog.html');
const SITE_URL = 'https://imaginative-kangaroo-c59e1b.netlify.app';

// The three posts that were already on the site before the automation.
const EXISTING_POSTS = [
  { href: 'is-2026-a-good-time-to-buy-a-home-in-phoenix.html', title: 'Is 2026 a Good Time to Buy a Home in Phoenix?', excerpt: 'A straight look at where prices, inventory, and rates actually stand heading into this year.', image: 'blog-card-phoenix.jpg', tag: 'Market', tagClass: 't-mkt', date: '2026-09-17', order: 3 },
  { href: 'will-arizona-home-prices-drop-in-2026.html', title: 'Will Arizona Home Prices Drop in 2026?', excerpt: 'What the data says, and what it means for your timeline either way.', image: 'https://images.pexels.com/photos/7578848/pexels-photo-7578848.jpeg?auto=compress&cs=tinysrgb&w=1200', tag: 'Buyers', tagClass: 't-buy', date: '2026-09-17', order: 2 },
  { href: 'waterfall-hikes-in-arizona.html', title: 'Waterfall Hikes in Arizona: A Refreshing Experience', excerpt: 'A little AZ life content, because we sell homes, not just houses.', image: 'https://images.pexels.com/photos/4254563/pexels-photo-4254563.jpeg?auto=compress&cs=tinysrgb&w=1200', tag: 'AZ Hot Spots', tagClass: 't-life', date: '2026-09-17', order: 1 },
];

const TAG_CLASSES = { 'market update': 't-mkt', market: 't-mkt', buyers: 't-buy', sellers: 't-sell', listings: 't-sell' };
const CTA_HEADINGS = { buyers: 'Thinking about buying in Arizona?', sellers: 'Thinking about selling?', 'market update': 'Want to know what this means for you?' };

// ---------- helpers ----------
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  let out = esc(text);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const ext = /^https?:\/\//i.test(url);
    return `<a class="inline" href="${url}"${ext ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  return out;
}
const plain = (s) => String(s || '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

function phoenixToday() {
  const now = new Date(Date.now() - 7 * 3600 * 1000); // Arizona is UTC-7 all year
  return now.toISOString().slice(0, 10);
}

function parseDate(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

function prettyDate(iso) {
  const [y, mo, d] = iso.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[mo - 1]} ${d}, ${y}`;
}

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ---------- post file parsing ----------
// Each post file: a "---" header block of "key: value" lines, then "---", then the post body.
function parsePost(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const meta = {};
  let i = 0;
  if (lines[0].trim() === '---') {
    i = 1;
    for (; i < lines.length; i++) {
      if (lines[i].trim() === '---') { i++; break; }
      const k = lines[i].indexOf(':');
      if (k > 0) meta[lines[i].slice(0, k).trim().toLowerCase()] = lines[i].slice(k + 1).trim();
    }
  }
  meta.body = lines.slice(i).join('\n').trim();
  meta.slug = slugify(meta.slug || meta.title || path.basename(file, path.extname(file)));
  meta.date = parseDate(meta.date);
  return meta;
}

// ---------- markdown-lite to HTML ----------
function blocks(md) {
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = []; } };
  const flushList = () => { if (list) { out.push({ t: 'ul', items: list }); list = null; } };
  for (const line of md.split('\n')) {
    const l = line.trim();
    if (!l) { flushPara(); flushList(); continue; }
    let m;
    if ((m = l.match(/^(#{2,3})\s+(.*)$/))) { flushPara(); flushList(); out.push({ t: m[1].length === 2 ? 'h2' : 'h3', text: m[2] }); continue; }
    if ((m = l.match(/^[-*]\s+(.*)$/))) { flushPara(); (list = list || []).push(m[1]); continue; }
    flushList();
    para.push(l);
  }
  flushPara(); flushList();
  return out;
}

function renderBlocks(bs) {
  return bs.map((b) => {
    if (b.t === 'ul') return '  <ul>\n' + b.items.map((it) => `    <li>${inline(it)}</li>`).join('\n') + '\n  </ul>';
    return `  <${b.t}>${inline(b.text)}</${b.t}>`;
  }).join('\n\n');
}

function splitBody(body) {
  const lines = body.split('\n');
  // Snippet: first line is a **bold question**, the line(s) right after are the short answer.
  let snippet = null;
  if (/^\*\*.+\*\*$/.test((lines[0] || '').trim())) {
    const q = lines[0].trim().replace(/^\*\*|\*\*$/g, '');
    let j = 1; const ans = [];
    while (j < lines.length && lines[j].trim()) { ans.push(lines[j].trim()); j++; }
    snippet = { q, a: ans.join(' ') };
    lines.splice(0, j);
  }
  const rest = lines.join('\n');
  const faqAt = rest.search(/^##\s+(FAQ|Frequently Asked Questions|People also ask)\s*$/im);
  const main = faqAt >= 0 ? rest.slice(0, faqAt) : rest;
  const faqPart = faqAt >= 0 ? rest.slice(faqAt).split('\n').slice(1).join('\n') : '';

  const faqs = []; const closing = [];
  if (faqPart) {
    let cur = null;
    for (const b of blocks(faqPart)) {
      if (b.t === 'h3') { cur = { q: b.text, a: [] }; faqs.push(cur); continue; }
      if (cur && cur.a.length === 0 && b.t === 'p') { cur.a.push(b.text); continue; }
      closing.push(b);
    }
  }
  return { snippet, mainBlocks: blocks(main), faqs, closing };
}

// ---------- page builders ----------
function imgUrl(src) {
  if (!src) return '';
  return /^https?:\/\//i.test(src) ? src : `${SITE_URL}/${src.replace(/^\//, '')}`;
}

function buildPost(post, template, others) {
  const { snippet, mainBlocks, faqs, closing } = splitBody(post.body);
  const cat = post.category || 'Living in Arizona';
  const tagClass = TAG_CLASSES[cat.toLowerCase()] || 't-life';
  const author = post.author || 'Tomi Homes';
  const url = `${SITE_URL}/${post.slug}.html`;
  const desc = post.meta || post.excerpt || '';
  const words = post.body.split(/\s+/).length;
  const mins = Math.max(1, Math.round(words / 200));

  const headMeta = [
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="author" content="${esc(author)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${esc(post.title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    post.image ? `<meta property="og:image" content="${esc(imgUrl(post.image))}">` : '',
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:site_name" content="Tomi Homes">`,
    `<meta property="article:published_time" content="${post.date}">`,
    `<meta property="article:author" content="${esc(author)}">`,
    `<meta property="article:section" content="${esc(cat)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(post.title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    post.image ? `<meta name="twitter:image" content="${esc(imgUrl(post.image))}">` : '',
  ].filter(Boolean).join('\n');

  const ld = [{
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: desc,
    image: post.image ? imgUrl(post.image) : undefined, datePublished: post.date, dateModified: post.date,
    inLanguage: 'en-US', articleSection: cat, mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: { '@type': 'Organization', name: author },
    publisher: { '@type': 'Organization', name: 'Tomi Homes' },
  }];
  if (faqs.length) ld.push({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a.join(' ')) } })),
  });
  const ldJson = ld.map((o) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2).replace(/</g, '\\u003c')}\n</script>`).join('\n');

  const postHead = `<header class="post-head">
  <div class="post-head-in">
    <div class="sun-label">Living in the Sun &middot; A Sun Sanctuaries Series</div>
    <span class="p-tag ${tagClass}">${esc(cat)}</span>
    <h1 class="post-h1">${esc(post.title)}</h1>
    <div class="post-meta">
      <div class="p-av">${esc(author.charAt(0).toUpperCase())}</div><span>${esc(author)}</span>
      <div class="p-dot"></div><span>${prettyDate(post.date)}</span>
      <div class="p-dot"></div><span>${mins} min read</span>
    </div>
  </div>
</header>`;

  const hero = post.image
    ? `<figure class="slot hero-slot">\n  <img src="${esc(post.image)}" alt="${esc(post.alt || post.title)}" fetchpriority="high">\n</figure>`
    : '';

  const article = `<article class="article">
${snippet ? `  <div class="snippet">\n    <div class="q">${inline(snippet.q)}</div>\n    <div class="a">${inline(snippet.a)}</div>\n  </div>\n\n` : ''}${renderBlocks(mainBlocks)}
</article>`;

  const faqHtml = faqs.length ? `<section class="faq">
  <div class="faq-in">
    <h2>People also ask</h2>
${faqs.map((f) => `    <div class="faq-item">\n      <h3>${inline(f.q)}</h3>\n      <p>${inline(f.a.join(' '))}</p>\n    </div>`).join('\n')}
  </div>
</section>` : '';

  const closingParas = closing
    .filter((b) => !/^your guide to loving and living in arizona\.?$/i.test(plain(b.text || '')))
    .map((b) => (b.t === 'ul' ? renderBlocks([b]) : `    <p>${inline(b.text)}</p>`)).join('\n');
  const cta = `<section class="post-cta">
  <div class="post-cta-in">
    <h2>${CTA_HEADINGS[cat.toLowerCase()] || 'Thinking about making Arizona home?'}</h2>
${closingParas || '    <p>Whether you are buying, selling, or just curious about the Valley, we are happy to help. No pressure, just perspective.</p>'}
    <a href="tel:6024057941" class="btn btn-orange">Call or Text 602.405.7941</a>
    <div class="sig">Tomi Homes | W &amp; Partners &middot; Your Guide to Loving and Living in Arizona</div>
  </div>
</section>`;

  const more = `<section class="more">
  <div class="more-in">
    <h2>Keep reading</h2>
    <div class="more-grid">
${others.slice(0, 3).map((o) => `      <a href="${o.href}" class="m-card"><div class="mt">${esc(o.title)}</div><div class="mx">${esc(o.excerpt)}</div></a>`).join('\n')}
    </div>
  </div>
</section>`;

  return template
    .replace('{{TITLE_TAG}}', esc(post.title))
    .replace('{{HEAD_META}}', headMeta)
    .replace('{{LD_JSON}}', ldJson)
    .replace('{{CATEGORY}}', esc(cat))
    .replace('{{POST_HEAD}}', postHead)
    .replace('{{HERO}}', hero)
    .replace('{{ARTICLE}}', article)
    .replace('{{FAQ}}', faqHtml)
    .replace('{{CTA}}', cta)
    .replace('{{MORE}}', more)
    .replace('{{SLUG}}', esc(post.slug))
    .replace('</body>', '<!-- generated-by-build-blog -->\n</body>');
}

function buildCards(entries) {
  return entries.map((e, i) => {
    const feat = i === 0;
    const bg = i % 2 === 0 ? 'b-navy' : 'b-sage';
    const img = e.image ? `,url('${e.image.replace(/'/g, '%27')}') center/cover` : '';
    return `    <a href="${e.href}" class="b-card${feat ? ' b-feat' : ''}">
      <div class="b-img ${bg} ${feat ? 'b-lg' : 'b-sm'}" style="background:linear-gradient(rgba(2,71,87,.22),rgba(2,71,87,.62))${img}"><span class="b-tag ${e.tagClass}">${esc(e.tag)}</span></div>
      <div class="b-body">
        <div class="b-title">${esc(e.title)}</div>
        <div class="b-excerpt">${esc(e.excerpt)}</div>
      </div>
    </a>`;
  }).join('\n');
}

// ---------- run ----------
function main() {
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  const today = process.env.BLOG_TODAY || phoenixToday();
  const files = fs.existsSync(POSTS_DIR) ? fs.readdirSync(POSTS_DIR).filter((f) => /\.(md|txt)$/i.test(f)) : [];
  // Pages that were built by hand are never overwritten. Generated pages carry a marker.
  const MARK = '<!-- generated-by-build-blog -->';
  const handBuilt = new Set(fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'))
    .filter((f) => !fs.readFileSync(path.join(ROOT, f), 'utf8').includes(MARK))
    .map((f) => f.replace(/\.html$/, '')));

  const posts = [];
  for (const f of files) {
    const p = parsePost(path.join(POSTS_DIR, f));
    if (!p.title || !p.date || !p.body) { console.log(`Skipping ${f}: missing title, date, or body`); continue; }
    if (p.date > today) { console.log(`Skipping ${f}: scheduled for ${p.date}`); continue; }
    if (handBuilt.has(p.slug)) { console.log(`Skipping ${f}: ${p.slug}.html is an existing site page`); continue; }
    posts.push(p);
  }
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));

  const newEntries = posts.map((p) => ({
    href: `${p.slug}.html`, title: p.title, excerpt: p.excerpt || '', image: p.image || '',
    tag: p.category || 'Living in Arizona', tagClass: TAG_CLASSES[(p.category || '').toLowerCase()] || 't-life', date: p.date, order: 0,
  }));
  const all = newEntries.concat(EXISTING_POSTS).sort((a, b) => (a.date === b.date ? b.order - a.order : a.date < b.date ? 1 : -1));

  for (const p of posts) {
    const others = all.filter((e) => e.href !== `${p.slug}.html`);
    fs.writeFileSync(path.join(ROOT, `${p.slug}.html`), buildPost(p, template, others));
    console.log(`Built ${p.slug}.html (${p.date})`);
  }

  const blog = fs.readFileSync(BLOG_PAGE, 'utf8');
  const start = '<!-- BLOG-CARDS:START -->';
  const end = '<!-- BLOG-CARDS:END -->';
  const a = blog.indexOf(start); const b = blog.indexOf(end);
  if (a < 0 || b < 0) throw new Error('blog.html is missing the BLOG-CARDS markers');
  fs.writeFileSync(BLOG_PAGE, blog.slice(0, a + start.length) + '\n' + buildCards(all) + '\n    ' + blog.slice(b));
  console.log(`blog.html updated with ${all.length} cards`);
}

main();
