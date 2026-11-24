/* VI Radio DB: renders docs/tracks.json as radio listings. Plain JS, no dependencies.
 * The only network request is tracks.json; the optional YouTube mix loads only after a click.
 *
 * Routes (hash based, so GitHub Pages needs no rewrites):
 *   #/                    listings: station index, search and station entries
 *   #/station/<slug>      one station's feature page
 *   #/contribute          how to send corrections
 *   #<slug>               old GitHub-style anchor, redirected to #/station/<slug>
 */
(function () {
  'use strict';

  var DATA_URL = 'tracks.json'; // relative, so it works under /vi-radio-db/
  var SITE_NAME = 'VI Radio DB';
  var REPO_URL = 'https://github.com/rgvxsthi/vi-radio-db';
  var NO_LIST = 'No track list found yet';

  var SERVICES = [
    { key: 'spotify', short: 'Spotify', long: 'Spotify' },
    { key: 'youtube_music', short: 'YT Music', long: 'YouTube Music' },
    { key: 'apple_music', short: 'Apple Music', long: 'Apple Music' }
  ];

  var CONFIDENCE = {
    high: { label: 'High', note: 'The order of the music records in the game files and the artists’ genre agree.',
      talk: 'Show names match the station’s published line-up.' },
    medium: { label: 'Medium', note: 'One source of evidence.' },
    low: { label: 'Low', note: 'Best guess.' }
  };

  // The repo's GitHub issue forms (.github/ISSUE_TEMPLATE).
  var FORMS = [
    { file: '1-missing-song.yml', name: 'Missing song',
      desc: 'A song plays on a station but isn’t in the list.' },
    { file: '2-wrong-song.yml', name: 'Wrong song or wrong station',
      desc: 'A song is listed under the wrong station, or isn’t in the game at all.' },
    { file: '3-artist-title.yml', name: 'Artist or title correction',
      desc: 'Misspelled or incomplete artist or title, missing featured artist, wrong capitalisation.' },
    { file: '4-listening-link.yml', name: 'Listening link',
      desc: 'A Spotify, Apple Music or YouTube Music link is wrong, or you found the exact track for a search link.' },
    { file: '5-station-details.yml', name: 'Station details',
      desc: 'Hosts, genre, frequency, a station with no or only part of its track list, or a full-station mix on YouTube.' },
    { file: '6-podcast-talk.yml', name: 'Podcast or talk show',
      desc: 'A missing or wrong podcast episode or talk show, or a link to listen to one.' }
  ];

  /* ---------- small helpers ---------- */

  function h(tag, props) {
    var node = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    });
    for (var i = 2; i < arguments.length; i++) add(node, arguments[i]);
    return node;
  }
  function add(node, kid) {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { add(node, k); }); return; }
    node.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
  }
  function $(id) { return document.getElementById(id); }
  function str(v) { return typeof v === 'string' && v.trim() ? v.trim() : ''; }
  function plural(n, one, many) { return n.toLocaleString('en') + ' ' + (n === 1 ? one : many); }
  function isTalk(st) { return st.kind === 'talk'; }
  function isWebUrl(url) {
    if (typeof url !== 'string') return false;
    try { var p = new URL(url).protocol; return p === 'https:' || p === 'http:'; } catch (e) { return false; }
  }
  function stationHref(st) { return '#/station/' + encodeURIComponent(st.slug); }
  function countText(st) {
    var n = (st.tracks || []).length;
    if (!n) return NO_LIST;
    return isTalk(st) ? plural(n, 'entry', 'entries') : plural(n, 'track', 'tracks');
  }
  // Talk stations have no music records to order, so their "high" line says what was matched.
  function confNote(st, c) { return isTalk(st) && c.talk ? c.talk : c.note; }
  function countOf(n, st) { return isTalk(st) ? (n === 1 ? 'entry' : 'entries') : (n === 1 ? 'track' : 'tracks'); }
  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  }

  /* ---------- search: accent folding and highlighting ---------- */

  // Lowercase and strip accents, keeping a map back to the original string for highlights.
  function normMap(s) {
    var out = '', map = [];
    for (var i = 0; i < s.length;) {
      var ch = String.fromCodePoint(s.codePointAt(i));
      var n = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      for (var j = 0; j < n.length; j++) map.push(i);
      out += n;
      i += ch.length;
    }
    map.push(s.length);
    return { out: out, map: map };
  }
  function norm(s) { return normMap(String(s || '')).out; }
  function terms(q) { return norm(q).split(/\s+/).filter(Boolean); }

  // Writes text into node, wrapping matched terms in <mark>; an empty value shows a dash.
  function fillText(node, text, words, missingLabel) {
    node.textContent = '';
    if (!text) {
      if (!missingLabel) return;
      node.appendChild(h('span', { class: 'missing', 'aria-hidden': 'true', text: '–' }));
      node.appendChild(h('span', { class: 'sr-only', text: missingLabel + ' not listed' }));
      return;
    }
    if (!words.length) { node.textContent = text; return; }
    var nm = normMap(text), ranges = [];
    words.forEach(function (t) {
      var from = 0, at;
      while ((at = nm.out.indexOf(t, from)) !== -1) {
        var a = nm.map[at], b = nm.map[at + t.length];
        ranges.push([a, b > a ? b : a + 1]);
        from = at + t.length;
      }
    });
    if (!ranges.length) { node.textContent = text; return; }
    ranges.sort(function (x, y) { return x[0] - y[0]; });
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

  /* ---------- listening links ---------- */

  function listenLinks(t) {
    var links = (t && t.links) || {};
    var exact = Array.isArray(t && t.exact) ? t.exact : [];
    var what = [str(t.title), str(t.artist)].filter(Boolean).join(' by ') || 'this entry';
    return SERVICES.filter(function (s) { return isWebUrl(links[s.key]); }).map(function (s) {
      // YouTube Music links are always searches; others are exact only when listed in "exact".
      var isExact = s.key !== 'youtube_music' && exact.indexOf(s.key) !== -1;
      return h('a', {
        class: 'listen ' + (isExact ? 'listen--exact' : 'listen--search'),
        href: links[s.key], target: '_blank', rel: 'noopener',
        title: (isExact ? 'Open on ' : 'Search on ') + s.long,
        'aria-label': (isExact ? 'Open ' + what + ' on ' + s.short : 'Search ' + s.short + ' for ' + what) + ' (opens in a new tab)'
      }, s.short);
    });
  }

  /* ---------- track tables ---------- */

  function hasEpisodes(st) { return (st.tracks || []).some(function (t) { return str(t.title); }); }

  function cell(cls, label) { return h('td', { class: cls, 'data-label': label }); }

  /* Music: Title | Artist | Listen. Talk: Show | Episode | Listen, with Episode dropped when
     no entry has one. Rows keep their text so search terms can be highlighted later. */
  function trackTable(st) {
    var talk = isTalk(st), episodes = !talk || hasEpisodes(st);
    var cols = talk ? (episodes ? ['Show', 'Episode', 'Listen'] : ['Show', 'Listen']) : ['Title', 'Artist', 'Listen'];
    var table = h('table', { class: 'tl' + (episodes ? '' : ' tl--one'), 'aria-labelledby': 'tl-title' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { scope: 'col', class: 'c-' + c.toLowerCase(), text: c }); }))));
    var body = h('tbody');
    var rows = [];
    (st.tracks || []).forEach(function (t) {
      var title = str(t.title), artist = str(t.artist);
      var tr = h('tr');
      var first, second = null;
      if (talk) {
        first = cell('c-show', 'Show'); tr.appendChild(first); fillText(first, artist, [], 'Show');
        if (episodes) { second = cell('c-episode', 'Episode'); tr.appendChild(second); fillText(second, title, [], 'Episode'); }
      } else {
        first = cell('c-title', 'Title'); tr.appendChild(first); fillText(first, title, [], 'Title');
        second = cell('c-artist', 'Artist'); tr.appendChild(second); fillText(second, artist, [], 'Artist');
      }
      tr.appendChild(h('td', { class: 'c-listen', 'data-label': 'Listen' }, listenLinks(t)));
      body.appendChild(tr);
      rows.push({
        tr: tr, a: first, b: second,
        aText: talk ? artist : title, bText: talk ? title : artist,
        aLabel: talk ? 'Show' : 'Title', bLabel: talk ? 'Episode' : 'Artist',
        hay: norm(title + '\n' + artist + '\n' + str(t.artist_game)), lit: false
      });
    });
    table.appendChild(body);
    return { table: table, rows: rows };
  }

  function filterRows(rows, words) {
    var shown = 0;
    rows.forEach(function (r) {
      var ok = words.every(function (w) { return r.hay.indexOf(w) !== -1; });
      r.tr.hidden = !ok;
      if (!ok) return;
      shown++;
      if (words.length || r.lit) {
        fillText(r.a, r.aText, words, r.aLabel);
        if (r.b) fillText(r.b, r.bText, words, r.bLabel);
        r.lit = words.length > 0;
      }
    });
    return shown;
  }

  /* ---------- state ---------- */

  var stations = [];
  var bySlug = new Map();
  var allTracks = [];
  var totalTracks = 0;
  var lastStationSlug = null;
  var homeScroll = 0;
  var firstRoute = true;
  var currentView = null;
  var opener = null; // the home-page link that opened the current station, for Back

  /* ---------- home: listings ---------- */

  function entry(st) {
    var info = st.info || {};
    var n = (st.tracks || []).length;
    var c = n ? CONFIDENCE[st.confidence] : null;
    var bits = [];
    if (str(info.genre)) bits.push(str(info.genre).replace(/\.$/, '') + '.');
    if (str(info.host)) bits.push('With ' + str(info.host).replace(/\.$/, '') + '.');
    return h('p', { class: 'entry' + (isTalk(st) ? ' entry--talk' : '') },
      h('a', { class: 'runin', href: stationHref(st), 'data-slug': st.slug, text: st.name }),
      ' ', bits.join(' '), bits.length ? ' ' : '',
      h('span', { class: n ? 'entry-count' : 'entry-count entry-count--none', text: countText(st) + '.' }),
      c ? h('span', { class: 'entry-conf', text: ' ' + c.label + ' confidence.' }) : null);
  }

  function buildHome() {
    var stand = $('stand');
    stand.textContent = '';
    stand.append(h('b', { text: String(stations.length) }), ' stations and ', h('b', { text: totalTracks.toLocaleString('en') }),
      ' tracks from the radio in Grand Theft Auto VI, listed by station with host, genre and track count.');

    var strip = h('ul', { class: 'strip-list', role: 'list' });
    stations.forEach(function (st) { strip.appendChild(h('li', null, h('a', { href: stationHref(st), 'data-slug': st.slug, text: st.name }))); });
    $('strip').appendChild(strip);

    var body = $('listings-body');
    var music = stations.filter(function (s) { return !isTalk(s); });
    var talk = stations.filter(isTalk);
    // Section heads carry their own tally on the right, like a listings page's column heads.
    function sectionHead(name, group, one, many) {
      var n = group.reduce(function (a, s) { return a + (s.tracks || []).length; }, 0);
      return h('h2', { class: 'section-head' }, h('span', { class: 'section-name', text: name }),
        h('span', { class: 'sr-only', text: ', ' }),
        h('span', { class: 'section-count', text: plural(group.length, 'station', 'stations') + ', ' + plural(n, one, many) }));
    }
    body.appendChild(sectionHead('Music', music, 'track', 'tracks'));
    body.appendChild($('key')); // the key box leads the first column, like a newspaper key
    music.forEach(function (st) { body.appendChild(entry(st)); });
    if (talk.length) {
      body.appendChild(sectionHead('Talk and podcasts', talk, 'entry', 'entries'));
      talk.forEach(function (st) { body.appendChild(entry(st)); });
    }

    var q = $('q'), timer = null;
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(runSearch, 90); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Escape' && q.value) { q.value = ''; runSearch(); } });
  }

  // Search across every station: Title | Artist | Station | Listen.
  function runSearch() {
    var words = terms($('q').value);
    var box = $('results-table');
    box.textContent = '';
    $('results').hidden = !words.length;
    if (!words.length) { $('find-status').textContent = ''; return; }
    var hits = allTracks.filter(function (x) { return words.every(function (w) { return x.hay.indexOf(w) !== -1; }); });
    var stationsHit = new Set(hits.map(function (x) { return x.st; })).size;
    $('find-status').textContent = hits.length
      ? plural(hits.length, 'match', 'matches') + ' on ' + plural(stationsHit, 'station', 'stations') + '.'
      : 'No titles or artists match.';
    if (!hits.length) return;
    var table = h('table', { class: 'tl tl--results', 'aria-labelledby': 'results-title' },
      h('thead', null, h('tr', null, ['Title', 'Artist', 'Station', 'Listen'].map(function (c) {
        return h('th', { scope: 'col', class: 'c-' + c.toLowerCase(), text: c });
      }))));
    var tbody = h('tbody');
    hits.forEach(function (x) {
      var talk = isTalk(x.st);
      var a = cell('c-title', talk ? 'Episode' : 'Title'), b = cell('c-artist', talk ? 'Show' : 'Artist');
      fillText(a, str(x.t.title), words, talk ? 'Episode' : 'Title');
      fillText(b, str(x.t.artist), words, talk ? 'Show' : 'Artist');
      tbody.appendChild(h('tr', null, a, b,
        h('td', { class: 'c-station', 'data-label': 'Station' }, h('a', { href: stationHref(x.st), 'data-slug': x.st.slug, text: x.st.name })),
        h('td', { class: 'c-listen', 'data-label': 'Listen' }, listenLinks(x.t))));
    });
    table.appendChild(tbody);
    box.appendChild(table);
  }

  /* ---------- station page ---------- */

  var YT_ID = /^[A-Za-z0-9_-]{11}$/;

  /* Optional full-station mix. Click-to-load: nothing is requested from YouTube until the
     reader presses the button. */
  function renderMix(st) {
    var mix = st.info && typeof st.info === 'object' ? st.info.youtube_mix : null;
    if (!mix || typeof mix !== 'object' || typeof mix.id !== 'string' || !YT_ID.test(mix.id)) return null;
    var id = mix.id, title = str(mix.title), credit = str(mix.credit);
    var frame = h('div', { class: 'mix-frame' });
    var button = h('button', { type: 'button', class: 'mix-load', 'aria-label': 'Load the YouTube player', 'aria-describedby': 'mix-note' },
      h('span', { class: 'mix-play', 'aria-hidden': 'true' }),
      h('span', { class: 'mix-load-text' },
        h('span', { class: 'mix-load-label', text: 'Load the YouTube player' }),
        h('span', { class: 'mix-load-note', id: 'mix-note', text: 'This connects to youtube-nocookie.com.' })));
    frame.appendChild(button);
    button.addEventListener('click', function () {
      var iframe = h('iframe', {
        src: 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1',
        title: 'YouTube video player: ' + (title || st.name),
        loading: 'lazy',
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
        referrerpolicy: 'strict-origin-when-cross-origin',
        allowfullscreen: true
      });
      frame.textContent = '';
      frame.classList.add('mix-frame--loaded');
      frame.appendChild(iframe);
      iframe.focus();
    });
    return h('section', { class: 'mix', 'aria-labelledby': 'mix-title' },
      h('h2', { class: 'mix-title', id: 'mix-title', text: 'Listen to the full station' }),
      title ? h('p', { class: 'mix-name', text: title }) : null,
      frame,
      h('p', { class: 'mix-meta' },
        h('a', { href: 'https://www.youtube.com/watch?v=' + id, target: '_blank', rel: 'noopener' },
          'Watch on YouTube', h('span', { class: 'sr-only', text: ' (opens in a new tab)' })),
        credit ? h('span', { class: 'mix-credit', text: credit }) : null));
  }

  function formUrl(form, title) {
    var url = REPO_URL + '/issues/new?template=' + encodeURIComponent(form.file);
    if (title) url += '&title=' + encodeURIComponent(title);
    return url;
  }
  function formByFile(file) { return FORMS.filter(function (f) { return f.file === file; })[0]; }

  // Shortcuts to the forms that fit this kind of station, with the issue title filled in.
  function renderSuggest(st) {
    var files = isTalk(st)
      ? ['6-podcast-talk.yml', '5-station-details.yml']
      : (st.tracks || []).length
        ? ['1-missing-song.yml', '2-wrong-song.yml', '3-artist-title.yml', '4-listening-link.yml', '5-station-details.yml']
        : ['5-station-details.yml', '1-missing-song.yml'];
    return h('section', { class: 'corrections', 'aria-labelledby': 'corrections-title' },
      h('h2', { class: 'corrections-title', id: 'corrections-title', text: 'Suggest a correction' }),
      h('p', null, 'Spotted a mistake? Each link opens a GitHub issue form in a new tab, or see ',
        h('a', { href: '#/contribute', text: 'all ways to contribute' }), '.'),
      h('ul', null, files.map(function (file) {
        var f = formByFile(file);
        return h('li', null, h('a', {
          href: formUrl(f, '[' + f.name + '] ' + st.name), target: '_blank', rel: 'noopener',
          'aria-label': f.name + ' form for ' + st.name + ' on GitHub (opens in a new tab)', text: f.name
        }));
      })));
  }

  function renderStation(slug) {
    var view = $('view-station');
    view.textContent = '';
    var st = bySlug.get(slug);

    if (!st) {
      view.appendChild(h('div', { class: 'feature-top' },
        h('h1', { class: 'feature-name', id: 'station-title', tabindex: '-1', text: 'Not in the listings' })));
      view.appendChild(h('div', { class: 'not-found' },
        h('p', null, 'There is no station at the address “' + slug + '”.'),
        h('p', null, h('a', { href: '#/', text: 'Back to the listings' }))));
      return { title: 'Station not found' };
    }

    var info = st.info || {};
    var n = (st.tracks || []).length;
    var conf = n ? CONFIDENCE[st.confidence] : null;

    view.appendChild(h('div', { class: 'feature-top' },
      h('p', { class: 'feature-kind' }, h('a', { href: '#/', text: 'Listings' }), ' / ', isTalk(st) ? 'Talk and podcasts' : 'Music'),
      h('h1', { class: 'feature-name', id: 'station-title', tabindex: '-1', text: st.name })));

    // Facts column
    var facts = [['Host', str(info.host)], ['Genre', str(info.genre)], ['Frequency', str(info.frequency)]]
      .filter(function (f) { return f[1]; });
    var sources = Array.isArray(info.sources) ? info.sources.filter(function (s) { return s && str(s.label); }) : [];
    var aside = h('aside', { class: 'feature-aside', 'aria-label': 'About ' + st.name },
      n ? h('p', { class: 'fact fact--count' }, h('b', { class: 'fact-num', text: n.toLocaleString('en') }), ' ', h('span', { class: 'fact-unit', text: countOf(n, st) }))
        : h('p', { class: 'fact fact--count fact--none' }, NO_LIST + '.'),
      facts.map(function (f) { return h('p', { class: 'fact' }, h('b', { text: f[0] + ' ' }), f[1]); }),
      conf ? h('p', { class: 'fact' }, h('b', { text: conf.label + ' confidence. ' }), confNote(st, conf)) : null,
      sources.length ? h('h2', { class: 'sources-title', id: 'sources-title', text: sources.length === 1 ? 'Source' : 'Sources' }) : null,
      sources.length ? h('ul', { class: 'sources', 'aria-labelledby': 'sources-title' }, sources.map(function (s) {
        return h('li', null, isWebUrl(s.url)
          ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, str(s.label), h('span', { class: 'sr-only', text: ' (opens in a new tab)' }))
          : h('span', { text: str(s.label) }));
      })) : null,
      renderSuggest(st));

    // Main column
    var main = h('div', { class: 'feature-main' },
      str(info.summary) ? h('p', { class: 'stand', text: str(info.summary) }) : h('p', { class: 'stand stand--none', text: 'No details yet.' }),
      renderMix(st));

    var lab = isTalk(st) ? 'Shows' : 'Tracklist';
    var section = h('section', { class: 'tracks', 'aria-labelledby': 'tl-title' });
    var head = h('div', { class: 'tl-head' },
      h('h2', { id: 'tl-title' }, lab, ' ', h('span', { class: 'tl-count', text: n ? countText(st) : '' })));
    section.appendChild(head);
    if (n) {
      var tt = trackTable(st);
      var status = h('p', { class: 'tl-status', id: 'station-q-status', role: 'status', 'aria-live': 'polite' });
      var input = h('input', { id: 'station-q', type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: 'Filter this list', 'aria-describedby': 'station-q-status' });
      var empty = h('p', { class: 'notice', hidden: true, text: 'Nothing on this station matches your filter.' });
      head.appendChild(h('div', { class: 'tl-filter', role: 'search' },
        h('label', { class: 'sr-only', for: 'station-q', text: 'Filter this list' }), input));
      section.appendChild(h('p', { class: 'tl-legend' },
        h('span', { class: 'key-chip key-chip--exact', text: 'Filled' }), ' opens the track; ',
        h('span', { class: 'key-chip', text: 'outlined' }), ' opens a search. Links open in a new tab.'));
      section.appendChild(status);
      section.appendChild(tt.table);
      section.appendChild(empty);
      var timer = null;
      var run = function () {
        var words = terms(input.value);
        var shown = filterRows(tt.rows, words);
        empty.hidden = !words.length || shown > 0;
        status.textContent = words.length ? 'Showing ' + shown + ' of ' + countText(st) + '.' : '';
      };
      input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 60); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Escape' && input.value) { input.value = ''; run(); } });
    } else {
      section.appendChild(h('p', { class: 'empty', text: NO_LIST + '.' }));
    }
    main.appendChild(section);
    view.appendChild(h('div', { class: 'feature-body' }, main, aside)); // reading order = visual order at every width

    var i = stations.indexOf(st), prev = stations[i - 1], next = stations[i + 1];
    view.appendChild(h('nav', { class: 'pager', 'aria-label': 'More stations' },
      prev ? h('a', { class: 'pager-prev', href: stationHref(prev), rel: 'prev' }, h('span', { class: 'pager-dir', text: 'Previous' }), h('span', { class: 'pager-name', text: prev.name })) : h('span'),
      next ? h('a', { class: 'pager-next', href: stationHref(next), rel: 'next' }, h('span', { class: 'pager-dir', text: 'Next' }), h('span', { class: 'pager-name', text: next.name })) : h('span')));
    return { title: st.name };
  }

  /* ---------- contribute ---------- */

  function buildContribute() {
    var list = $('contribute-forms');
    FORMS.forEach(function (f) {
      list.appendChild(h('div', { class: 'form-entry' },
        h('h3', { class: 'runin', text: f.name }),
        h('p', { text: f.desc }),
        h('a', { class: 'form-open', href: formUrl(f), target: '_blank', rel: 'noopener',
          'aria-label': 'Open form: ' + f.name + ' (GitHub, opens in a new tab)', text: 'Open form' })));
    });
  }

  /* ---------- routing ---------- */

  var VIEWS = ['view-home', 'view-station', 'view-contribute'];

  function setView(id) {
    if (currentView === 'view-home' && id !== 'view-home') homeScroll = window.scrollY;
    VIEWS.forEach(function (v) { $(v).hidden = v !== id; });
    if (id !== 'view-station') $('view-station').textContent = '';
    [['nav-listings', 'view-home'], ['nav-contribute', 'view-contribute']].forEach(function (p) {
      if (p[1] === id) $(p[0]).setAttribute('aria-current', 'page'); else $(p[0]).removeAttribute('aria-current');
    });
    var previous = currentView;
    currentView = id;
    return previous;
  }

  function showHome() {
    var previous = setView('view-home');
    document.title = SITE_NAME;
    if (firstRoute || previous === 'view-home') return;
    window.scrollTo(0, homeScroll);
    var back = null;
    if (previous === 'view-station' && lastStationSlug) {
      // The link that opened the station (index, entry or search result) if it is still on screen,
      // otherwise the station's entry in the listings.
      if (opener && opener.isConnected && opener.getAttribute('data-slug') === lastStationSlug && opener.getClientRects().length) back = opener;
      else back = document.querySelector('#listings .runin[data-slug="' + cssEscape(lastStationSlug) + '"]');
    }
    back = back || $('home-title');
    back.focus({ preventScroll: true });
    var r = back.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) back.scrollIntoView({ block: 'center' });
  }

  function showStation(slug) {
    if (currentView === 'view-home') homeScroll = window.scrollY;
    var res = renderStation(slug);
    setView('view-station');
    lastStationSlug = slug;
    document.title = res.title + ' · ' + SITE_NAME;
    window.scrollTo(0, 0);
    if (!firstRoute) $('station-title').focus({ preventScroll: true });
  }

  function showContribute() {
    setView('view-contribute');
    document.title = 'Contribute · ' + SITE_NAME;
    window.scrollTo(0, 0);
    if (!firstRoute) $('contribute-title').focus({ preventScroll: true });
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

  // Remember which home-page link opened a station, so Back can return focus to it.
  document.addEventListener('click', function (e) {
    if (currentView !== 'view-home') return;
    var a = e.target.closest && e.target.closest('a[href^="#/station/"][data-slug]');
    if (a) opener = a;
  });

  /* ---------- boot ---------- */

  function start(data) {
    if (!data || !Array.isArray(data.stations)) throw new Error('tracks.json has no "stations" list');
    var list = data.stations.filter(function (s) { return s && str(s.name) && str(s.slug); });
    // Music first, then kind "talk", keeping the data's order within each group.
    stations = list.filter(function (s) { return !isTalk(s); }).concat(list.filter(isTalk));
    stations.forEach(function (st) {
      bySlug.set(st.slug, st);
      (st.tracks || []).forEach(function (t) {
        allTracks.push({ st: st, t: t, hay: norm(str(t.title) + '\n' + str(t.artist) + '\n' + str(t.artist_game)) });
      });
    });
    totalTracks = allTracks.length;
    buildHome();
    buildContribute();
    $('load-state').hidden = true;
    window.addEventListener('hashchange', route);
    route();
  }

  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(start)
    .catch(function (err) {
      var el = $('load-state');
      el.classList.add('notice--error');
      el.textContent = 'Could not load the listings (' + (err && err.message ? err.message : 'unknown error') + '). If you opened this file directly, serve the docs folder over HTTP instead.';
      if (window.console) console.warn('VI Radio DB:', err);
    });
})();
