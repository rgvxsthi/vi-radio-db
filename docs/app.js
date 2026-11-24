/* VI Radio DB: renders docs/tracks.json. Plain JS, no dependencies, no external requests.
 *
 * Routes (hash based, so GitHub Pages needs no rewrites):
 *   #/                    home: station grid and the full searchable track list
 *   #/station/<slug>      one station's page
 *   #<slug>               old GitHub-style anchor, redirected to #/station/<slug>
 */
(function () {
  'use strict';

  var DATA_URL = 'tracks.json'; // relative, so it works under /vi-radio-db/
  var SITE_NAME = 'VI Radio DB';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var SERVICES = [
    { key: 'spotify', short: 'Spotify', long: 'Spotify' },
    { key: 'youtube_music', short: 'YT Music', long: 'YouTube Music' },
    { key: 'apple_music', short: 'Apple Music', long: 'Apple Music' }
  ];

  var CONFIDENCE = {
    high: { label: 'High', note: 'The order of the music records in the game files and the artists\u2019 genre agree.' },
    medium: { label: 'Medium', note: 'One source of evidence.' },
    low: { label: 'Low', note: 'Best guess.' }
  };

  /* ---------- small DOM helpers ---------- */

  function h(tag, props) {
    var node = document.createElement(tag);
    setProps(node, props);
    appendKids(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }

  function svg(tag, props) {
    var node = document.createElementNS(SVG_NS, tag);
    setProps(node, props);
    appendKids(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }

  function setProps(node, props) {
    if (!props) return;
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.setAttribute('class', v);
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    });
  }

  function appendKids(node, kids) {
    kids.forEach(function (kid) {
      if (Array.isArray(kid)) appendKids(node, kid);
      else if (kid !== null && kid !== undefined && kid !== false) {
        node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
      }
    });
  }

  var NO_LIST = 'No track list found yet';

  function trackCount(n) {
    return n ? plural(n, 'track', 'tracks') : NO_LIST;
  }

  function plural(n, one, many) {
    return n.toLocaleString('en') + ' ' + (n === 1 ? one : many);
  }

  function str(v) {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  }

  function isWebUrl(url) {
    if (typeof url !== 'string') return false;
    try {
      var u = new URL(url);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch (e) {
      return false;
    }
  }

  /* ---------- station classification ---------- */

  // Talk and podcast sections (kind "talk") are listed after the music stations and look secondary.
  function isSecondary(st) {
    return st.kind === 'talk';
  }

  /* ---------- deterministic colour ---------- */

  function fnv1a(s) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  function hslToRgb(hue, sat, light) {
    var s = sat / 100, l = light / 100;
    var a = s * Math.min(l, 1 - l);
    function f(n) {
      var k = (n + hue / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    }
    return [f(0), f(8), f(4)];
  }

  function luminance(rgb) {
    var c = rgb.map(function (x) {
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function hex(s) {
    return [1, 3, 5].map(function (i) { return parseInt(s.substr(i, 2), 16) / 255; });
  }

  function hsl(hue, sat, light) {
    return 'hsl(' + hue + ', ' + sat + '%, ' + light + '%)';
  }

  // Page backgrounds from styles.css, used to keep accent text readable.
  var WHITE = [1, 1, 1];
  var LIGHT_BG = hex('#f6f6f3');
  var DARK_BG = hex('#131417');
  var DARK_SURFACE = hex('#1c1d21');

  /* One palette per station. "solid" fills the badge behind white text; the
     light/dark text colours are the same hue, tuned for 4.5:1 or better
     against each theme's background and the station's tint. */
  function paletteFor(st) {
    var seed = fnv1a(st.slug || st.name || '');
    var hue, sat;
    if (isSecondary(st)) {
      hue = 215; sat = 10; // neutral grey-blue for talk and podcasts
    } else {
      hue = seed % 360;
      sat = 55 + ((seed >>> 9) % 25);
    }
    var lightTint = hsl(hue, Math.min(sat, 60), 95);
    var darkTint = hsl(hue, Math.min(sat, 35), 16);
    var lightTintRgb = hslToRgb(hue, Math.min(sat, 60), 95);
    var darkTintRgb = hslToRgb(hue, Math.min(sat, 35), 16);

    var l = 46;
    while (l > 15 && contrast(hslToRgb(hue, sat, l), WHITE) < 4.6) l--;
    var solid = hsl(hue, sat, l);

    var lt = l;
    while (lt > 10 && Math.min(contrast(hslToRgb(hue, sat, lt), LIGHT_BG), contrast(hslToRgb(hue, sat, lt), lightTintRgb)) < 4.6) lt--;

    var dt = 55;
    while (dt < 95 && Math.min(
      contrast(hslToRgb(hue, sat, dt), DARK_BG),
      contrast(hslToRgb(hue, sat, dt), DARK_SURFACE),
      contrast(hslToRgb(hue, sat, dt), darkTintRgb)) < 4.6) dt++;

    return {
      solid: solid,
      lightText: hsl(hue, sat, lt),
      darkText: hsl(hue, sat, dt),
      lightTint: lightTint,
      darkTint: darkTint,
      dial: ((seed >>> 20) % 1000) / 1000
    };
  }

  function applyAccent(node, pal) {
    node.classList.add('accent');
    node.style.setProperty('--st-solid', pal.solid);
    node.style.setProperty('--st-light-text', pal.lightText);
    node.style.setProperty('--st-dark-text', pal.darkText);
    node.style.setProperty('--st-light-tint', pal.lightTint);
    node.style.setProperty('--st-dark-tint', pal.darkTint);
  }

  /* ---------- original, generic badges ---------- */

  // Initials of the name's words, ignoring "the", "of", "and" and anything in brackets.
  function monogram(name) {
    var base = String(name || '').replace(/\([^)]*\)/g, ' ');
    var words = base.split(/[\s\-\/]+/).map(function (w) {
      return w.replace(/[^A-Za-z0-9\u00C0-\u024F]/g, '');
    }).filter(Boolean);
    var lettered = words.filter(function (w) { return /^[A-Za-z\u00C0-\u024F]/.test(w) && !/^(the|of|and)$/i.test(w); });
    if (!lettered.length) return (words[0] || '?').slice(0, 2).toUpperCase();
    if (lettered.length === 1) {
      var w = lettered[0];
      if (w.length <= 4 && w === w.toUpperCase()) return w; // already an acronym
      return w.slice(0, 2).toUpperCase();
    }
    return lettered.slice(0, 3).map(function (x) { return x.charAt(0); }).join('').toUpperCase();
  }

  function polar(r, deg) {
    var rad = deg * Math.PI / 180;
    return [20 + r * Math.cos(rad), 20 + r * Math.sin(rad)];
  }

  function fmt(n) { return Math.round(n * 100) / 100; }

  var DIAL_ARC = 'M6.58 12.25A15.5 15.5 0 0 1 33.42 12.25'; // top arc, -150deg to -30deg

  function badge(st, pal, size) {
    var root = svg('svg', {
      viewBox: '0 0 40 40', width: size, height: size,
      class: 'badge', 'aria-hidden': 'true', focusable: 'false'
    });
    root.appendChild(svg('circle', { cx: 20, cy: 20, r: 19.5, fill: pal.solid }));
    root.appendChild(svg('circle', { cx: 20, cy: 20, r: 18, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.18, 'stroke-width': 1 }));

    if (st.kind === 'talk') {
      // Microphone: capsule, cradle and stand.
      root.appendChild(svg('rect', { x: 16, y: 8.5, width: 8, height: 14, rx: 4, fill: '#fff' }));
      root.appendChild(svg('path', { d: 'M12.5 18.5a7.5 7.5 0 0 0 15 0', fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round' }));
      root.appendChild(svg('path', { d: 'M20 26v5M15.5 31h9', fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round' }));
      return root;
    }

    // Music station: dial arc with a marker, plus the monogram.
    root.appendChild(svg('path', { d: DIAL_ARC, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.5, 'stroke-width': 1.4, 'stroke-linecap': 'round' }));
    var p = polar(15.5, -150 + pal.dial * 120);
    root.appendChild(svg('circle', { cx: fmt(p[0]), cy: fmt(p[1]), r: 2, fill: '#fff' }));
    var mono = monogram(st.name);
    var fs = mono.length <= 2 ? 14 : mono.length === 3 ? 11.5 : 9.5;
    root.appendChild(svg('text', {
      x: 20, y: 24.5, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': fs, 'font-weight': 700, fill: '#fff', class: 'badge-text'
    }, mono));
    return root;
  }

  /* ---------- confidence pill ---------- */

  function confPill(level, withWord) {
    var c = CONFIDENCE[level];
    if (!c) return null; // no confidence (stations without a track list): show no badge
    var cls = 'conf conf--' + level;
    var label = c.label;
    return h('span', { class: cls },
      h('span', { class: 'conf-bars', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      withWord ? label + ' confidence' : h('span', null, label, h('span', { class: 'sr-only', text: ' confidence' })));
  }

  /* ---------- search normalisation and highlighting ---------- */

  // Lowercase and strip accents, keeping a map back to the original string
  // so highlights land on the right characters.
  function normMap(s) {
    var out = '', map = [];
    for (var i = 0; i < s.length;) {
      var cp = s.codePointAt(i);
      var ch = String.fromCodePoint(cp);
      var n = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      for (var j = 0; j < n.length; j++) map.push(i);
      out += n;
      i += ch.length;
    }
    map.push(s.length);
    return { out: out, map: map };
  }

  function norm(s) { return normMap(s).out; }

  function parseQuery(q) {
    return norm(q || '').split(/\s+/).filter(Boolean);
  }

  function fillText(node, text, terms, missingLabel) {
    node.textContent = '';
    if (!text) {
      if (!missingLabel) return; // nothing to show, and nothing worth announcing
      node.appendChild(h('span', { class: 'missing', 'aria-hidden': 'true', text: '\u2014' }));
      node.appendChild(h('span', { class: 'sr-only', text: missingLabel + ' not listed' }));
      return;
    }
    if (!terms.length) { node.textContent = text; return; }

    var nm = normMap(text);
    var ranges = [];
    terms.forEach(function (t) {
      var from = 0, at;
      while ((at = nm.out.indexOf(t, from)) !== -1) {
        var start = nm.map[at];
        var end = nm.map[at + t.length];
        if (end <= start) end = start + 1;
        ranges.push([start, end]);
        from = at + t.length;
      }
    });
    if (!ranges.length) { node.textContent = text; return; }
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [ranges[0]];
    for (var i = 1; i < ranges.length; i++) {
      var last = merged[merged.length - 1];
      if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
      else merged.push(ranges[i]);
    }
    var pos = 0;
    merged.forEach(function (r) {
      if (r[0] > pos) node.appendChild(document.createTextNode(text.slice(pos, r[0])));
      node.appendChild(h('mark', null, text.slice(r[0], r[1])));
      pos = r[1];
    });
    if (pos < text.length) node.appendChild(document.createTextNode(text.slice(pos)));
  }

  /* ---------- track list ---------- */

  function searchIcon() {
    return svg('svg', { class: 'listen-icon', viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': 'true', focusable: 'false' },
      svg('circle', { cx: 6.8, cy: 6.8, r: 4.6, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
      svg('path', { d: 'M10.4 10.4L14 14', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }));
  }

  function playIcon() {
    return svg('svg', { class: 'listen-icon', viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': 'true', focusable: 'false' },
      svg('path', { d: 'M4 2.5v11l9.5-5.5z', fill: 'currentColor' }));
  }

  function trackList(st) {
    var ul = h('ul', { class: 'tracks' });
    var rows = [];
    (st.tracks || []).forEach(function (t) {
      var artist = str(t && t.artist) || '';
      var title = str(t && t.title) || '';
      var what = [artist, title].filter(Boolean).join(' \u2013 ') || 'this entry';
      var aSpan = h('span', { class: 't-artist' });
      var tSpan = h('span', { class: 't-title' });
      // Talk entries are often a show name with no episode title: leave the title blank
      // there instead of marking it missing on every row.
      var titleLabel = isSecondary(st) ? null : 'Title';
      fillText(aSpan, artist, [], 'Artist');
      fillText(tSpan, title, [], titleLabel);

      var links = (t && t.links) || {};
      var exact = Array.isArray(t && t.exact) ? t.exact : [];
      var buttons = SERVICES.filter(function (s) { return isWebUrl(links[s.key]); }).map(function (s) {
        // YouTube Music links are always searches; others are exact only when listed in "exact".
        var isExact = s.key !== 'youtube_music' && exact.indexOf(s.key) !== -1;
        return h('a', {
          class: 'listen listen--' + s.key + (isExact ? ' listen--exact' : ' listen--search'),
          href: links[s.key],
          target: '_blank',
          rel: 'noopener',
          title: (isExact ? 'Open on ' : 'Search on ') + s.long,
          'aria-label': (isExact ? 'Open ' + what + ' on ' + s.long : 'Search ' + s.long + ' for ' + what) + ' (opens in a new tab)'
        }, isExact ? playIcon() : searchIcon(), s.short);
      });

      var li = h('li', { class: 'track' },
        h('span', { class: 't-names' }, aSpan, h('span', { class: 'sr-only', text: ', ' }), tSpan),
        buttons.length ? h('span', { class: 't-links' }, buttons) : null);
      ul.appendChild(li);
      var gameArtist = str(t && t.artist_game) || '';
      rows.push({ li: li, aSpan: aSpan, tSpan: tSpan, artist: artist, title: title, titleLabel: titleLabel, hay: norm(artist + '\n' + title + '\n' + gameArtist), lit: false });
    });
    return { ul: ul, rows: rows };
  }

  function filterRows(rows, terms) {
    var shown = 0;
    rows.forEach(function (r) {
      var ok = terms.every(function (t) { return r.hay.indexOf(t) !== -1; });
      r.li.hidden = !ok;
      if (ok) {
        shown++;
        if (terms.length || r.lit) {
          fillText(r.aSpan, r.artist, terms, 'Artist');
          fillText(r.tSpan, r.title, terms, r.titleLabel);
          r.lit = terms.length > 0;
        }
      }
    });
    return shown;
  }

  /* ---------- state ---------- */

  var stations = [];
  var bySlug = new Map();
  var palettes = new Map();
  var homeItems = [];
  var totalTracks = 0;
  var lastStationSlug = null;
  var homeScroll = 0;
  var firstRoute = true;

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- home view ---------- */

  function stationHref(st) { return '#/station/' + encodeURIComponent(st.slug); }

  function card(st, pal) {
    var n = (st.tracks || []).length;
    var count = h('span', { class: 'card-count', text: trackCount(n) });
    var a = h('a', { class: 'card', href: stationHref(st), 'data-slug': st.slug },
      badge(st, pal, isSecondary(st) ? 40 : 52),
      h('span', { class: 'card-body' },
        h('span', { class: 'card-name', text: st.name }),
        h('span', { class: 'card-meta' }, count, confPill(st.confidence, false))));
    applyAccent(a, pal);
    return { li: h('li', null, a), link: a, count: count, total: n };
  }

  function homeSection(st, pal) {
    var list = trackList(st);
    var n = (st.tracks || []).length;
    var headId = 'all-' + st.slug;
    var sec = h('section', { class: 'station-block' + (isSecondary(st) ? ' station-block--secondary' : ''), 'aria-labelledby': headId },
      h('div', { class: 'station-block-head' },
        badge(st, pal, 36),
        h('h3', { id: headId }, h('a', { href: stationHref(st), text: st.name })),
        h('span', { class: 'station-block-meta' }, trackCount(n),
          CONFIDENCE[st.confidence] ? [' \u00b7 ', confPill(st.confidence, false)] : null)),
      n ? list.ul : h('p', { class: 'notice notice--empty', text: NO_LIST + '.' }));
    applyAccent(sec, pal);
    return { section: sec, rows: list.rows };
  }

  function buildHome() {
    var gp = $('grid-primary'), gs = $('grid-secondary'), secs = $('sections');
    stations.forEach(function (st) {
      var pal = palettes.get(st.slug);
      var c = card(st, pal);
      (isSecondary(st) ? gs : gp).appendChild(c.li);
      var s = homeSection(st, pal);
      secs.appendChild(s.section);
      homeItems.push({ st: st, card: c, section: s.section, rows: s.rows });
    });
    $('secondary-group').hidden = !gs.children.length;

    var input = $('q');
    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(runHomeSearch, 80);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && input.value) { input.value = ''; runHomeSearch(); }
    });
    runHomeSearch();
  }

  function runHomeSearch() {
    var terms = parseQuery($('q').value);
    var searching = terms.length > 0;
    var total = 0, sections = 0, anyPrimary = false, anySecondary = false;
    homeItems.forEach(function (it) {
      var n = filterRows(it.rows, terms);
      total += n;
      if (n) sections++;
      it.section.hidden = searching && n === 0;
      it.card.li.hidden = searching && n === 0;
      it.card.count.textContent = searching
        ? plural(n, 'match', 'matches') + ' of ' + it.card.total
        : trackCount(it.card.total);
      if (!it.card.li.hidden) {
        if (isSecondary(it.st)) anySecondary = true; else anyPrimary = true;
      }
    });
    $('music-heading').parentNode.hidden = !anyPrimary;
    $('secondary-group').hidden = !anySecondary;
    $('no-results').hidden = !searching || total > 0;
    $('search-status').textContent = searching
      ? (total ? plural(total, 'track', 'tracks') + ' in ' + plural(sections, 'section', 'sections') + ' match.' : 'No tracks match.')
      : '';
  }

  /* ---------- station view ---------- */

  function renderAbout(st) {
    var sec = h('section', { class: 'about', 'aria-labelledby': 'about-heading' }, h('h2', { id: 'about-heading', text: 'About' }));
    var info = st.info;
    var added = false;
    if (info && typeof info === 'object') {
      var summary = str(info.summary);
      if (summary) { sec.appendChild(h('p', { class: 'about-summary', text: summary })); added = true; }

      var facts = [['Host', str(info.host)], ['Genre', str(info.genre)], ['Frequency', str(info.frequency)]]
        .filter(function (f) { return f[1]; });
      if (facts.length) {
        sec.appendChild(h('dl', { class: 'facts' }, facts.map(function (f) {
          return h('div', null, h('dt', { text: f[0] }), h('dd', { text: f[1] }));
        })));
        added = true;
      }

      // A source with a web URL is a link; one without (url null or not http/https) is plain text.
      var sources = Array.isArray(info.sources) ? info.sources.filter(function (s) {
        return s && str(s.label);
      }) : [];
      if (sources.length) {
        sec.appendChild(h('ul', { class: 'sources' }, sources.map(function (s) {
          if (!isWebUrl(s.url)) return h('li', null, 'Source: ', h('span', { class: 'source-text', text: str(s.label) }));
          return h('li', null, 'Source: ', h('a', { href: s.url, target: '_blank', rel: 'noopener', text: str(s.label) }),
            h('span', { class: 'sr-only', text: ' (opens in a new tab)' }));
        })));
        added = true;
      }
    }
    if (!added) sec.appendChild(h('p', { class: 'muted', text: 'No details yet.' }));
    return sec;
  }

  /* Optional full-station mix. Click-to-load: nothing is requested from YouTube
     until the visitor presses the button. */
  var YT_ID = /^[A-Za-z0-9_-]{11}$/;

  function renderMix(st) {
    var mix = st.info && typeof st.info === 'object' ? st.info.youtube_mix : null;
    if (!mix || typeof mix !== 'object' || typeof mix.id !== 'string' || !YT_ID.test(mix.id)) return null;
    var id = mix.id;
    var mixTitle = str(mix.title);
    var credit = str(mix.credit);
    var frameTitle = 'YouTube video player: ' + (mixTitle || st.name);

    var frameBox = h('div', { class: 'mix-frame' });
    var button = h('button', { type: 'button', class: 'mix-load' },
      svg('svg', { class: 'mix-play', viewBox: '0 0 48 48', width: 48, height: 48, 'aria-hidden': 'true', focusable: 'false' },
        svg('circle', { cx: 24, cy: 24, r: 23, fill: 'currentColor' }),
        svg('path', { d: 'M19 14.5v19l15.5-9.5z', fill: '#fff' })),
      h('span', { class: 'mix-load-text' },
        h('span', { class: 'mix-load-label', text: 'Load the YouTube player' }),
        h('span', { class: 'mix-load-note', text: 'This connects to youtube-nocookie.com.' })));
    frameBox.appendChild(button);

    button.addEventListener('click', function () {
      var iframe = h('iframe', {
        src: 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1',
        title: frameTitle,
        loading: 'lazy',
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
        referrerpolicy: 'strict-origin-when-cross-origin',
        allowfullscreen: true
      });
      frameBox.textContent = '';
      frameBox.classList.add('mix-frame--loaded');
      frameBox.appendChild(iframe);
      iframe.focus();
    });

    return h('section', { class: 'mix', 'aria-labelledby': 'mix-heading' },
      h('h2', { id: 'mix-heading', text: 'Listen to the full station' }),
      mixTitle ? h('p', { class: 'mix-title', text: mixTitle }) : null,
      frameBox,
      h('p', { class: 'mix-meta' },
        h('a', { href: 'https://www.youtube.com/watch?v=' + id, target: '_blank', rel: 'noopener' },
          'Watch on YouTube', h('span', { class: 'sr-only', text: ' (opens in a new tab)' })),
        credit ? h('span', { class: 'mix-credit', text: credit }) : null));
  }

  function pagerLink(st, rel) {
    if (!st) return h('span', { class: 'pager-link pager-link--empty', 'aria-hidden': 'true' });
    var label = rel === 'prev' ? 'Previous' : 'Next';
    var a = h('a', { class: 'pager-link pager-link--' + rel, href: stationHref(st), rel: rel },
      h('span', { class: 'pager-dir' }, rel === 'prev' ? '\u2190 ' + label : label + ' \u2192'),
      h('span', { class: 'pager-name', text: st.name }));
    applyAccent(a, palettes.get(st.slug));
    return a;
  }

  function renderStation(slug) {
    var view = $('view-station');
    view.textContent = '';
    var st = bySlug.get(slug);

    if (!st) {
      view.appendChild(h('div', { class: 'not-found' },
        h('h1', { class: 'page-title', id: 'station-title', tabindex: '-1', text: 'Station not found' }),
        h('p', null, 'There is no station with the address \u201c' + slug + '\u201d.'),
        h('p', null, h('a', { href: '#/', text: '\u2190 Back to all stations' }))));
      return { title: 'Station not found' };
    }

    var idx = stations.indexOf(st);
    var pal = palettes.get(st.slug);
    var n = (st.tracks || []).length;
    var conf = CONFIDENCE[st.confidence];
    applyAccent(view, pal);

    var crumbs = h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' },
      h('a', { href: '#/', class: 'back-link', text: '\u2190 All stations' }));

    var hero = h('header', { class: 'hero' },
      badge(st, pal, 120),
      h('div', { class: 'hero-text' },
        h('p', { class: 'hero-kicker', text: isSecondary(st) ? 'Talk' : 'Station' }),
        h('h1', { class: 'hero-title', id: 'station-title', tabindex: '-1', text: st.name }),
        n ? h('p', { class: 'hero-meta' }, h('span', { text: trackCount(n) }), confPill(st.confidence, true)) : null,
        conf ? h('p', { class: 'hero-conf-note' }, conf.label + ' confidence: ' + conf.note) : null));

    var list = trackList(st);
    var inputId = 'station-q';
    var status = h('p', { class: 'search-status', id: 'station-q-status', role: 'status', 'aria-live': 'polite' });
    var input = h('input', {
      id: inputId, type: 'search', autocomplete: 'off', spellcheck: 'false',
      placeholder: 'Artist or title', 'aria-describedby': 'station-q-status'
    });
    var empty = h('p', { class: 'notice', hidden: true, text: 'No tracks on this station match your filter.' });

    function run() {
      var terms = parseQuery(input.value);
      var shown = filterRows(list.rows, terms);
      empty.hidden = !terms.length || shown > 0;
      status.textContent = terms.length ? 'Showing ' + shown + ' of ' + plural(n, 'track', 'tracks') + '.' : '';
    }
    var timer = null;
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 60); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && input.value) { input.value = ''; run(); }
    });

    var filter = h('div', { class: 'station-filter', role: 'search' },
      h('label', { class: 'search-label', for: inputId, text: 'Filter this station' }),
      h('div', { class: 'search-field' },
        svgSearchIcon(),
        input,
        h('kbd', { class: 'search-hint', 'aria-hidden': 'true', text: '/' })),
      status);

    var tracksSection = h('section', { class: 'station-tracks', 'aria-labelledby': 'tracks-heading' },
      h('h2', { id: 'tracks-heading', text: 'Track list' }),
      !n ? null : h('p', { class: 'muted small listen-key' }, 'Links open in a new tab. ', playIcon(), h('span', { class: 'sr-only', text: 'A play icon' }), ' opens the track; ', searchIcon(), h('span', { class: 'sr-only', text: 'a magnifier icon' }), ' opens a search.'),
      n ? [filter, list.ul, empty] : h('p', { class: 'notice notice--empty', text: NO_LIST + '.' }));

    var pager = h('nav', { class: 'pager', 'aria-label': 'More stations' },
      pagerLink(stations[idx - 1], 'prev'),
      h('a', { class: 'pager-all', href: '#/', text: 'Back to all stations' }),
      pagerLink(stations[idx + 1], 'next'));

    view.appendChild(crumbs);
    view.appendChild(hero);
    view.appendChild(renderAbout(st));
    var mix = renderMix(st);
    if (mix) view.appendChild(mix);
    view.appendChild(tracksSection);
    view.appendChild(renderSuggest(st));
    view.appendChild(pager);
    return { title: st.name };
  }

  /* ---------- contributing ---------- */

  var REPO_URL = 'https://github.com/rgvxsthi/vi-radio-db';

  // The repo's GitHub issue forms (.github/ISSUE_TEMPLATE).
  var FORMS = [
    { file: '1-missing-song.yml', name: 'Missing song',
      desc: "A song plays on a station but isn't in the list." },
    { file: '2-wrong-song.yml', name: 'Wrong song or wrong station',
      desc: "A song is listed under the wrong station, or isn't in the game at all." },
    { file: '3-artist-title.yml', name: 'Artist or title correction',
      desc: 'Misspelled or incomplete artist or title, missing featured artist, wrong capitalisation.' },
    { file: '4-listening-link.yml', name: 'Listening link',
      desc: 'A Spotify, Apple Music or YouTube Music link is wrong, or you found the exact track for a search link.' },
    { file: '5-station-details.yml', name: 'Station details',
      desc: 'Hosts, genre, frequency, a station with no or only part of its track list, or a full-station mix on YouTube.' },
    { file: '6-podcast-talk.yml', name: 'Podcast or talk show',
      desc: 'A missing or wrong podcast episode or talk show, or a link to listen to one.' }
  ];

  function formByFile(file) {
    return FORMS.filter(function (f) { return f.file === file; })[0];
  }

  // New-issue URL for a form, optionally with the issue title filled in.
  function formUrl(form, title) {
    var url = REPO_URL + '/issues/new?template=' + encodeURIComponent(form.file);
    if (title) url += '&title=' + encodeURIComponent(title);
    return url;
  }

  function buildContribute() {
    var list = $('contribute-forms');
    FORMS.forEach(function (f, i) {
      var headId = 'form-' + (i + 1);
      list.appendChild(h('li', { class: 'form-card', 'aria-labelledby': headId },
        h('h3', { id: headId, text: f.name }),
        h('p', { text: f.desc }),
        h('a', {
          class: 'button', href: formUrl(f), target: '_blank', rel: 'noopener',
          'aria-label': 'Open the ' + f.name + ' form on GitHub (opens in a new tab)'
        }, 'Open form')));
    });
  }

  // Station page: shortcuts to the forms that fit this kind of station, with the title prefilled.
  function renderSuggest(st) {
    var files = isSecondary(st)
      ? ['6-podcast-talk.yml', '5-station-details.yml']
      : (st.tracks || []).length
        ? ['1-missing-song.yml', '2-wrong-song.yml', '3-artist-title.yml', '4-listening-link.yml', '5-station-details.yml']
        : ['5-station-details.yml', '1-missing-song.yml'];
    return h('aside', { class: 'suggest', 'aria-labelledby': 'suggest-heading' },
      h('h2', { id: 'suggest-heading', text: 'Suggest a correction' }),
      h('p', null, 'Spotted a mistake on this station? Open a GitHub issue form below (new tab), or see ',
        h('a', { href: '#/contribute', text: 'all ways to contribute' }), '.'),
      h('ul', { class: 'suggest-links' }, files.map(function (file) {
        var f = formByFile(file);
        return h('li', null, h('a', {
          href: formUrl(f, '[' + f.name + '] ' + st.name), target: '_blank', rel: 'noopener',
          'aria-label': f.name + ' form for ' + st.name + ' on GitHub (opens in a new tab)'
        }, f.name));
      })));
  }

  function svgSearchIcon() {
    return svg('svg', { class: 'search-icon', viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' },
      svg('circle', { cx: 8.5, cy: 8.5, r: 5.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
      svg('path', { d: 'M13 13l4.5 4.5', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }));
  }

  /* ---------- routing ---------- */

  var VIEWS = ['view-home', 'view-station', 'view-contribute'];
  var currentView = null;

  // Show one view, hide the others, and remember the home scroll position.
  function setView(id) {
    if (currentView === 'view-home' && id !== 'view-home') homeScroll = window.scrollY;
    VIEWS.forEach(function (v) { $(v).hidden = v !== id; });
    if (id !== 'view-station') $('view-station').textContent = '';
    var nav = $('nav-contribute');
    if (id === 'view-contribute') nav.setAttribute('aria-current', 'page');
    else nav.removeAttribute('aria-current');
    var previous = currentView;
    currentView = id;
    return previous;
  }

  function showHome() {
    var previous = setView('view-home');
    document.title = SITE_NAME;
    if (firstRoute || previous === 'view-home') return;
    window.scrollTo(0, homeScroll);
    var back = previous === 'view-station' && lastStationSlug &&
      document.querySelector('.card[data-slug="' + cssEscape(lastStationSlug) + '"]');
    if (back && !back.closest('[hidden]')) back.focus({ preventScroll: true });
    else $('home-title').focus({ preventScroll: true });
  }

  function showStation(slug) {
    if (currentView === 'view-home') homeScroll = window.scrollY;
    var res = renderStation(slug);
    setView('view-station');
    lastStationSlug = slug;
    document.title = res.title + ' \u00b7 ' + SITE_NAME;
    window.scrollTo(0, 0);
    if (!firstRoute) $('station-title').focus({ preventScroll: true });
  }

  function showContribute() {
    setView('view-contribute');
    document.title = 'Contribute \u00b7 ' + SITE_NAME;
    window.scrollTo(0, 0);
    if (!firstRoute) $('contribute-title').focus({ preventScroll: true });
  }

  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  }

  function route() {
    var hash = location.hash;
    var m = /^#\/station\/([^/?#]+)\/?$/.exec(hash);
    if (m) {
      var slug;
      try { slug = decodeURIComponent(m[1]); } catch (e) { slug = m[1]; }
      showStation(slug);
    } else if (/^#\/contribute\/?$/.test(hash)) {
      showContribute();
    } else if (hash.length > 1 && hash.charAt(1) !== '/' && bySlug.has(hash.slice(1))) {
      // Old-style #slug anchor (as in TRACKLIST.md): send it to the station page.
      location.replace('#/station/' + encodeURIComponent(hash.slice(1)));
      return;
    } else {
      showHome();
    }
    firstRoute = false;
  }

  // In-page anchors such as #main and #top: move focus without touching the route.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (href === '#' || href.charAt(1) === '/') return;
    var target = document.getElementById(href.slice(1));
    if (!target) return;
    e.preventDefault();
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start' });
  });

  // "/" focuses whichever search box is on screen.
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var box = !$('view-station').hidden ? $('station-q') : (!$('view-home').hidden ? $('q') : null);
    if (box) { e.preventDefault(); box.focus(); box.select(); }
  });

  /* ---------- boot ---------- */

  function fail(msg) {
    var el = $('load-state');
    el.hidden = false;
    el.classList.add('notice--error');
    el.textContent = msg;
  }

  function start(data) {
    if (!data || !Array.isArray(data.stations)) throw new Error('tracks.json has no "stations" list');
    var list = data.stations.filter(function (s) { return s && str(s.name) && str(s.slug); });
    // Music stations first, then kind "talk", keeping the data's order within each group.
    stations = list.filter(function (s) { return !isSecondary(s); }).concat(list.filter(isSecondary));
    stations.forEach(function (st) {
      bySlug.set(st.slug, st);
      palettes.set(st.slug, paletteFor(st));
      totalTracks += (st.tracks || []).length;
    });
    $('site-stats').textContent = plural(stations.length, 'section', 'sections') + ' \u00b7 ' + plural(totalTracks, 'track', 'tracks');
    buildHome();
    buildContribute();
    $('load-state').hidden = true;
    window.addEventListener('hashchange', route);
    route();
  }

  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(start)
    .catch(function (err) {
      fail('Could not load the track list (' + (err && err.message ? err.message : 'unknown error') + '). If you opened this file directly, serve the docs folder over HTTP instead.');
      if (window.console) console.warn('VI Radio DB:', err);
    });
})();
