#!/usr/bin/env node
/**
 * Build script for parasion.art
 *
 * Generates all HTML pages from templates + data.
 * Zero dependencies — uses only Node.js built-ins.
 *
 * Usage:  node build.js
 *         node build.js --watch
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DOCS = path.join(ROOT, 'docs');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/site.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Load templates & partials
// ---------------------------------------------------------------------------

const partials = {};
const partialsDir = path.join(ROOT, 'src/templates/partials');
for (const file of fs.readdirSync(partialsDir)) {
	if (file.endsWith('.html')) {
		partials[file.replace('.html', '')] = fs.readFileSync(path.join(partialsDir, file), 'utf8');
	}
}

const templates = {};
const pagesDir = path.join(ROOT, 'src/templates/pages');
for (const name of ['gallery', 'index', 'contact', '404']) {
	templates[name] = fs.readFileSync(path.join(pagesDir, name + '.html'), 'utf8');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePartials(template, depth) {
	if (depth === undefined) depth = 0;
	if (depth > 3) return template;
	return template.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, function(_, name) {
		return resolvePartials(partials[name] || '', depth + 1);
	});
}

function pageUrl(lang, slug) {
	if (lang === 'pl') return '/' + slug + '.html';
	return '/' + lang + '/' + slug + '.html';
}

function homeUrl(lang) {
	return data.langPrefix[lang];
}

function contactUrl(lang) {
	return pageUrl(lang, data.contact.slug[lang]);
}

function navLinks(lang) {
	var links = data.galleries.map(function(gal) {
		var href = pageUrl(lang, gal.slug[lang]);
		return '\t\t\t\t\t<a href="' + href + '">' + gal.label[lang] + '</a>';
	});
	// Add contact page link at the end
	links.push('\t\t\t\t\t<a href="' + contactUrl(lang) + '">' + data.contact.title[lang] + '</a>');
	return links.join('\n');
}

function hreflangTags(urls) {
	return data.languages.map(function(lang) {
		return '\t<link rel="alternate" hreflang="' + lang + '" href="' + urls[lang] + '">';
	}).join('\n');
}

function langSelectorLinks(currentLang) {
	return data.languages
		.filter(function(l) { return l !== currentLang; })
		.map(function(l) {
			var flag = data.langFlags[l];
			return '\t\t\t\t\t<a href="' + homeUrl(l) + '" onclick="localStorage.setItem(\'parasion_lang_chosen\',\'1\')"><img src="/img/' + flag.img + '" alt="' + flag.alt + '" width="24"></a>';
		}).join('\n');
}

function langDropdownLinks(currentLang) {
	return data.languages
		.filter(function(l) { return l !== currentLang; })
		.map(function(l) {
			var flag = data.langFlags[l];
			return '\t\t\t\t\t\t<a href="' + homeUrl(l) + '" onclick="localStorage.setItem(\'parasion_lang_chosen\',\'1\')"><img src="/img/' + flag.img + '" alt="' + flag.alt + '"></a>';
		}).join('\n');
}

function resolveBioLinks(bio, lang) {
	// Replace {{link:id}} or {{link:id|custom text}} with anchor tags
	return bio.replace(/\{\{link:([^|}]+)(?:\|([^}]*))?\}\}/g, function(_, id, customText) {
		var gal = data.galleries.find(function(g) { return g.id === id; });
		if (!gal) {
			console.error('  WARNING: Bio link references unknown gallery "' + id + '"');
			return customText || id;
		}
		var href = pageUrl(lang, gal.slug[lang]);
		var text = customText || gal.label[lang];
		return '<a href="' + href + '">' + text + '</a>';
	});
}

function galleryCards(lang) {
	return data.galleries.map(function(gal) {
		var href = pageUrl(lang, gal.slug[lang]);
		var img = gal.thumbImage || gal.ogImage;
		var pos = gal.thumbPosition || 'center center';
		var scale = gal.thumbScale || 1;
		var imgStyle = 'background-image: url(\'' + img + '\'); background-position: ' + pos + '; transform: scale(' + scale + ')';
		return '\t\t\t\t\t<a href="' + href + '" class="gallery-card">' +
			'\n\t\t\t\t\t\t<div class="gallery-card-img" style="' + imgStyle + '"></div>' +
			'\n\t\t\t\t\t\t<span class="gallery-card-label">' + gal.label[lang] + '</span>' +
			'\n\t\t\t\t\t</a>';
	}).join('\n');
}

function fill(template, vars) {
	// 1. Resolve partials first
	var out = resolvePartials(template);
	// 2. Replace variables
	for (var key in vars) {
		if (vars.hasOwnProperty(key)) {
			out = out.split('{{' + key + '}}').join(vars[key]);
		}
	}
	return out;
}

function writeOutput(relPath, content) {
	var abs = path.join(DOCS, relPath);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, content);
	console.log('  docs/' + relPath);
}

function copyDir(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	for (var entry of fs.readdirSync(src, { withFileTypes: true })) {
		var srcPath = path.join(src, entry.name);
		var destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDir(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

function cleanDocs() {
	// Remove HTML files in docs root and language subdirectories
	if (!fs.existsSync(DOCS)) return;
	var entries = fs.readdirSync(DOCS, { withFileTypes: true });
	for (var entry of entries) {
		var p = path.join(DOCS, entry.name);
		if (entry.isFile() && entry.name.endsWith('.html')) {
			fs.unlinkSync(p);
		} else if (entry.isDirectory() && data.languages.indexOf(entry.name) !== -1) {
			fs.rmSync(p, { recursive: true, force: true });
		}
	}
}

// ---------------------------------------------------------------------------
// Build gallery pages
// ---------------------------------------------------------------------------

function buildGalleryPage(gallery, galleryIndex, lang) {
	var slug = gallery.slug[lang];
	var url = pageUrl(lang, slug);
	var fullUrl = data.site.domain + url;
	var author = data.site.author;

	// hreflang URLs
	var hreflangs = {};
	for (var i = 0; i < data.languages.length; i++) {
		var l = data.languages[i];
		hreflangs[l] = data.site.domain + pageUrl(l, gallery.slug[l]);
	}

	// Build gallery content
	var content;
	if (gallery.galleries) {
		// Multi-gallery page (Way of the Cross)
		var parts = gallery.galleries.map(function(gal, i) {
			var marginStyle = i > 0 ? ' style="margin-top: 80px;"' : '';
			var lightbox = gallery.lightbox || '#00000080';
			var block = '\t\t\t<h1 class="gallery-title"' + marginStyle + '>' + gal.title[lang] + '</h1>\n';
			block += '\t\t\t<p class="gallery-description">' + gallery.description[lang] + '</p>\n';
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
		var lightbox = gallery.lightbox || '#00000080';
		content = '\t\t\t<h1 class="gallery-title">' + gallery.title[lang] + '</h1>\n' +
			'\t\t\t<p class="gallery-description">' + gallery.description[lang] + '</p>\n' +
			'\n\t\t\t<script>if(!window.picflow){window.picflow=!0;var s=document.createElement("script");s.src="https://picflow.com/embed/main.js";s.type=\'module\';s.defer=true;document.head.appendChild(s);}</script>\n' +
			'\t\t\t<picflow-gallery id="' + gallery.galleryId + '" tenant="' + data.site.tenant + '" lightbox="' + lightbox + '" no-padding="true" no-background="true"></picflow-gallery>';
	}

	// JSON-LD
	var jsonLd = '\t<script type="application/ld+json">\n\t{\n' +
		'\t\t"@context": "https://schema.org",\n' +
		'\t\t"@type": "ImageGallery",\n' +
		'\t\t"name": "' + gallery.title[lang] + '",\n' +
		'\t\t"description": "' + gallery.description[lang] + '",\n' +
		'\t\t"url": "' + fullUrl + '",\n' +
		'\t\t"author": {\n' +
		'\t\t\t"@type": "Person",\n' +
		'\t\t\t"name": "' + author + '"\n' +
		'\t\t}\n' +
		'\t}\n\t</script>';

	// Prev/Next navigation
	var prevLink = '';
	var nextLink = '';
	if (galleryIndex > 0) {
		var prev = data.galleries[galleryIndex - 1];
		prevLink = '\t\t\t\t<a href="' + pageUrl(lang, prev.slug[lang]) + '" class="gallery-nav-prev">&larr; ' + prev.label[lang] + '</a>';
	}
	if (galleryIndex < data.galleries.length - 1) {
		var next = data.galleries[galleryIndex + 1];
		nextLink = '\t\t\t\t<a href="' + pageUrl(lang, next.slug[lang]) + '" class="gallery-nav-next">' + next.label[lang] + ' &rarr;</a>';
	}

	var html = fill(templates.gallery, {
		lang: lang,
		clicky_id: data.site.clicky_id,
		ga_id: data.site.ga_id,
		author: author,
		domain: data.site.domain,
		title: author + ' — ' + gallery.title[lang],
		description: gallery.description[lang],
		ogDescription: gallery.description[lang],
		ogImage: gallery.ogImage,
		ogUrl: fullUrl,
		hreflangTags: hreflangTags(hreflangs),
		homeUrl: homeUrl(lang),
		menuButton: data.i18n[lang].menuButton,
		navLinks: navLinks(lang),
		langSelectorLinks: langSelectorLinks(lang),
		langDropdownLinks: langDropdownLinks(lang),
		languageMenuLabel: data.i18n[lang].languageMenuLabel,
		mobileBrand: data.site.mobileBrand,
		pageTitle: gallery.title[lang],
		content: content,
		jsonLd: jsonLd,
		prevLink: prevLink,
		nextLink: nextLink
	});

	var relPath = lang === 'pl'
		? slug + '.html'
		: lang + '/' + slug + '.html';

	writeOutput(relPath, html);
}

// ---------------------------------------------------------------------------
// Build index pages
// ---------------------------------------------------------------------------

function buildIndexPage(lang) {
	var i18n = data.i18n[lang];
	var author = data.site.author;
	var prefix = homeUrl(lang);
	var fullUrl = data.site.domain + prefix;

	var hreflangs = {};
	for (var i = 0; i < data.languages.length; i++) {
		var l = data.languages[i];
		hreflangs[l] = data.site.domain + homeUrl(l);
	}

	var bio = resolveBioLinks(i18n.bio, lang);
	bio = bio.split('{{author}}').join(author);

	var html = fill(templates.index, {
		lang: lang,
		clicky_id: data.site.clicky_id,
		ga_id: data.site.ga_id,
		author: author,
		domain: data.site.domain,
		title: i18n.indexTitle,
		description: i18n.indexDescription,
		ogDescription: i18n.indexOgDescription,
		ogImage: data.site.domain + '/img/bpr.png',
		ogUrl: fullUrl,
		hreflangTags: hreflangTags(hreflangs),
		homeUrl: prefix,
		menuButton: i18n.menuButton,
		navLinks: navLinks(lang),
		langDropdownLinks: langDropdownLinks(lang),
		languageMenuLabel: i18n.languageMenuLabel,
		mobileBrand: data.site.mobileBrand,
		heroAlt: i18n.heroAlt,
		heroSubtitle: i18n.heroSubtitle,
		langSelectorLinks: langSelectorLinks(lang),
		facebook: data.site.facebook,
		bio: bio,
		jsonLdDescription: i18n.indexJsonLdDescription,
		galleryCards: galleryCards(lang)
	});

	var relPath = lang === 'pl'
		? 'index.html'
		: lang + '/index.html';

	writeOutput(relPath, html);
}

// ---------------------------------------------------------------------------
// Build 404 page
// ---------------------------------------------------------------------------

function build404Page() {
	var html = fill(templates['404'], {
		clicky_id: data.site.clicky_id,
		ga_id: data.site.ga_id,
		author: data.site.author,
		homeUrl: '/',
		menuButton: data.i18n.pl.menuButton,
		navLinks: navLinks('pl'),
		langSelectorLinks: langSelectorLinks('pl'),
		langDropdownLinks: langDropdownLinks('pl'),
		languageMenuLabel: data.i18n.pl.languageMenuLabel,
		mobileBrand: data.site.mobileBrand,
		navLinks_pl: navLinks('pl')
	});
	writeOutput('404.html', html);
}

// ---------------------------------------------------------------------------
// Build contact pages
// ---------------------------------------------------------------------------

function buildContactPage(lang) {
	var author = data.site.author;
	var slug = data.contact.slug[lang];
	var url = pageUrl(lang, slug);
	var fullUrl = data.site.domain + url;

	var hreflangs = {};
	for (var i = 0; i < data.languages.length; i++) {
		var l = data.languages[i];
		hreflangs[l] = data.site.domain + pageUrl(l, data.contact.slug[l]);
	}

	var html = fill(templates.contact, {
		lang: lang,
		clicky_id: data.site.clicky_id,
		ga_id: data.site.ga_id,
		author: author,
		domain: data.site.domain,
		title: author + ' — ' + data.contact.title[lang],
		description: data.contact.description[lang],
		ogDescription: data.contact.description[lang],
		ogImage: data.site.domain + '/img/bpr.png',
		ogUrl: fullUrl,
		hreflangTags: hreflangTags(hreflangs),
		homeUrl: homeUrl(lang),
		menuButton: data.i18n[lang].menuButton,
		navLinks: navLinks(lang),
		langSelectorLinks: langSelectorLinks(lang),
		langDropdownLinks: langDropdownLinks(lang),
		languageMenuLabel: data.i18n[lang].languageMenuLabel,
		mobileBrand: data.site.mobileBrand,
		contactTitle: data.contact.title[lang],
		phoneLabel: data.contact.phoneLabel[lang],
		facebook: data.site.facebook,
		facebookLabel: data.contact.facebookLabel[lang]
	});

	var relPath = lang === 'pl'
		? slug + '.html'
		: lang + '/' + slug + '.html';

	writeOutput(relPath, html);
}

// ---------------------------------------------------------------------------
// Copy static assets
// ---------------------------------------------------------------------------

function copyStaticAssets() {
	// CSS
	var cssSrc = path.join(ROOT, 'src/css');
	if (fs.existsSync(cssSrc)) {
		copyDir(cssSrc, path.join(DOCS, 'css'));
	}

	// Images
	var imgSrc = path.join(ROOT, 'img');
	if (fs.existsSync(imgSrc)) {
		copyDir(imgSrc, path.join(DOCS, 'img'));
	}

	// CNAME
	var cname = path.join(ROOT, 'CNAME');
	if (fs.existsSync(cname)) {
		fs.copyFileSync(cname, path.join(DOCS, 'CNAME'));
	}

	// robots.txt
	var robots = path.join(ROOT, 'robots.txt');
	if (fs.existsSync(robots)) {
		fs.copyFileSync(robots, path.join(DOCS, 'robots.txt'));
	}
}

// ---------------------------------------------------------------------------
// Build validation
// ---------------------------------------------------------------------------

function validate() {
	var errors = 0;
	// Check bio link references
	for (var i = 0; i < data.languages.length; i++) {
		var lang = data.languages[i];
		var bio = data.i18n[lang].bio;
		var match;
		var re = /\{\{link:([^|}]+)/g;
		while ((match = re.exec(bio)) !== null) {
			var id = match[1];
			var found = data.galleries.find(function(g) { return g.id === id; });
			if (!found) {
				console.error('  ERROR: Bio (' + lang + ') references unknown gallery "' + id + '"');
				errors++;
			}
		}
	}
	if (errors > 0) {
		console.error('\nValidation failed with ' + errors + ' error(s).');
		process.exit(1);
	}
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

function build() {
	console.log('Building parasion.art...\n');

	validate();
	cleanDocs();
	copyStaticAssets();

	// Index pages (all languages)
	for (var i = 0; i < data.languages.length; i++) {
		buildIndexPage(data.languages[i]);
	}

	// Gallery pages (all languages x all galleries)
	for (var gi = 0; gi < data.galleries.length; gi++) {
		for (var li = 0; li < data.languages.length; li++) {
			buildGalleryPage(data.galleries[gi], gi, data.languages[li]);
		}
	}

	// Contact pages (all languages)
	for (var ci = 0; ci < data.languages.length; ci++) {
		buildContactPage(data.languages[ci]);
	}

	// 404 page
	build404Page();

	console.log('\nDone! Generated all HTML files in docs/.');
}

// ---------------------------------------------------------------------------
// Watch mode
// ---------------------------------------------------------------------------

if (process.argv.indexOf('--watch') !== -1) {
	build();
	console.log('\nWatching src/ for changes...\n');

	var timer = null;
	fs.watch(path.join(ROOT, 'src'), { recursive: true }, function() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(function() {
			timer = null;
			console.log('\nFile changed, rebuilding...\n');
			// Reload data
			try {
				var freshData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/site.json'), 'utf8'));
				Object.assign(data, freshData);
			} catch (e) {
				console.error('Error reading site.json:', e.message);
				return;
			}
			// Reload partials
			for (var file of fs.readdirSync(partialsDir)) {
				if (file.endsWith('.html')) {
					partials[file.replace('.html', '')] = fs.readFileSync(path.join(partialsDir, file), 'utf8');
				}
			}
			// Reload page templates
			for (var name of ['gallery', 'index', 'contact', '404']) {
				templates[name] = fs.readFileSync(path.join(pagesDir, name + '.html'), 'utf8');
			}
			build();
		}, 200);
	});
} else {
	build();
}
