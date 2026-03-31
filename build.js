#!/usr/bin/env node
/**
 * Build script for parasion.art
 *
 * Generates all HTML pages from templates + data.
 * Zero dependencies — uses only Node.js built-ins.
 *
 * Usage:  node build.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/site.json'), 'utf8'));
const templates = {};

for (const name of ['gallery', 'index', '404']) {
	templates[name] = fs.readFileSync(path.join(ROOT, 'src/templates', name + '.html'), 'utf8');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pageUrl(lang, slug) {
	if (lang === 'pl') return '/' + slug + '.html';
	return '/' + lang + '/' + slug + '.html';
}

function homeUrl(lang) {
	return data.langPrefix[lang];
}

function navLinks(lang) {
	return data.nav.map(item => {
		const href = pageUrl(lang, item.slug[lang]);
		return '\t\t\t\t\t<a href="' + href + '">' + item.label[lang] + '</a>';
	}).join('\n');
}

function hreflangTags(urls) {
	return data.languages.map(lang =>
		'\t<link rel="alternate" hreflang="' + lang + '" href="' + urls[lang] + '">'
	).join('\n');
}

function langSelectorLinks(currentLang) {
	return data.languages
		.filter(l => l !== currentLang)
		.map(l => {
			const flag = data.langFlags[l];
			return "\t\t\t\t\t<a href=\"" + homeUrl(l) + "\" onclick=\"localStorage.setItem('parasion_lang_chosen','1')\"><img src=\"/img/" + flag.img + "\" alt=\"" + flag.alt + "\" width=\"24\"></a>";
		}).join('\n');
}

function fill(template, vars) {
	let out = template;
	for (const [key, val] of Object.entries(vars)) {
		// Use split+join to replace all occurrences (no regex escaping needed)
		out = out.split('{{' + key + '}}').join(val);
	}
	return out;
}

function writeOutput(relPath, content) {
	const abs = path.join(ROOT, relPath);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, content);
	console.log('  ' + relPath);
}

// ---------------------------------------------------------------------------
// Build gallery pages
// ---------------------------------------------------------------------------

function buildGalleryPage(navItem, lang) {
	const pageId = navItem.id;
	const pageData = data.pages[pageId];
	const slug = navItem.slug[lang];
	const url = pageUrl(lang, slug);
	const fullUrl = data.site.domain + url;

	// Build hreflang URLs
	const hreflangs = {};
	for (const l of data.languages) {
		hreflangs[l] = data.site.domain + pageUrl(l, navItem.slug[l]);
	}

	// Build gallery content
	let content;
	if (pageData.galleries) {
		// Multi-gallery page (Way of the Cross)
		const parts = pageData.galleries.map((gal, i) => {
			const marginStyle = i > 0 ? ' style="margin-top: 80px;"' : '';
			const lightbox = pageData.lightbox || '#00000080';
			let block = '\t\t\t<h1 class="gallery-title"' + marginStyle + '>' + gal.title[lang] + '</h1>\n';
			if (i === 0) {
				block += '\n\t\t\t<script>if(!window.picflow){window.picflow=!0;var s=document.createElement("script");s.src="https://picflow.com/embed/main.js";s.type=\'module\';s.defer=true;document.head.appendChild(s);}</script>\n';
			} else {
				block += '\n';
			}
			block += '\t\t\t<picflow-gallery id="' + gal.galleryId + '" tenant="' + data.site.tenant + '" lightbox="' + lightbox + '" no-padding="true" no-background="true"></picflow-gallery>';
			return block;
		});
		content = parts.join('\n\n');
	} else {
		// Single gallery page
		const lightbox = pageData.lightbox || '#00000080';
		content = '\t\t\t<h1 class="gallery-title">' + pageData.title[lang] + '</h1>\n' +
			'\n\t\t\t<script>if(!window.picflow){window.picflow=!0;var s=document.createElement("script");s.src="https://picflow.com/embed/main.js";s.type=\'module\';s.defer=true;document.head.appendChild(s);}</script>\n' +
			'\t\t\t<picflow-gallery id="' + pageData.galleryId + '" tenant="' + data.site.tenant + '" lightbox="' + lightbox + '" no-padding="true" no-background="true"></picflow-gallery>';
	}

	// JSON-LD
	const jsonLd = '\t<script type="application/ld+json">\n\t{\n' +
		'\t\t"@context": "https://schema.org",\n' +
		'\t\t"@type": "ImageGallery",\n' +
		'\t\t"name": "' + pageData.title[lang] + '",\n' +
		'\t\t"description": "' + pageData.description[lang] + '",\n' +
		'\t\t"url": "' + fullUrl + '",\n' +
		'\t\t"author": {\n' +
		'\t\t\t"@type": "Person",\n' +
		'\t\t\t"name": "Bolesław Parasion"\n' +
		'\t\t}\n' +
		'\t}\n\t</script>';

	const html = fill(templates.gallery, {
		lang: lang,
		clicky_id: data.site.clicky_id,
		ga_id: data.site.ga_id,
		title: 'Bolesław Parasion — ' + pageData.title[lang],
		description: pageData.description[lang],
		ogImage: pageData.ogImage,
		ogUrl: fullUrl,
		hreflangTags: hreflangTags(hreflangs),
		homeUrl: homeUrl(lang),
		galleryButton: data.i18n[lang].galleryButton,
		navLinks: navLinks(lang),
		content: content,
		jsonLd: jsonLd
	});

	const relPath = lang === 'pl'
		? slug + '.html'
		: lang + '/' + slug + '.html';

	writeOutput(relPath, html);
}

// ---------------------------------------------------------------------------
// Build index pages
// ---------------------------------------------------------------------------

function buildIndexPage(lang) {
	const i18n = data.i18n[lang];
	const prefix = homeUrl(lang);
	const fullUrl = data.site.domain + prefix;

	const hreflangs = {};
	for (const l of data.languages) {
		hreflangs[l] = data.site.domain + homeUrl(l);
	}

	const html = fill(templates.index, {
		lang: lang,
		clicky_id: data.site.clicky_id,
		ga_id: data.site.ga_id,
		title: i18n.indexTitle,
		description: i18n.indexDescription,
		ogDescription: i18n.indexOgDescription,
		ogUrl: fullUrl,
		hreflangTags: hreflangTags(hreflangs),
		homeUrl: prefix,
		galleryButton: i18n.galleryButton,
		navLinks: navLinks(lang),
		heroAlt: i18n.heroAlt,
		langSelectorLinks: langSelectorLinks(lang),
		facebook: data.site.facebook,
		bio: i18n.bio,
		jsonLdDescription: i18n.indexJsonLdDescription
	});

	const relPath = lang === 'pl'
		? 'index.html'
		: lang + '/index.html';

	writeOutput(relPath, html);
}

// ---------------------------------------------------------------------------
// Build 404 page
// ---------------------------------------------------------------------------

function build404Page() {
	const html = fill(templates['404'], {
		clicky_id: data.site.clicky_id,
		ga_id: data.site.ga_id,
		navLinks_pl: navLinks('pl')
	});
	writeOutput('404.html', html);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Building parasion.art...\n');

// Index pages (all languages)
for (const lang of data.languages) {
	buildIndexPage(lang);
}

// Gallery pages (all languages × all nav items)
for (const navItem of data.nav) {
	for (const lang of data.languages) {
		buildGalleryPage(navItem, lang);
	}
}

// 404 page
build404Page();

console.log('\nDone! Generated all HTML files from templates.');
