/* Tandem TV — interactions côté client (menu, lecteur, recherche). */
(function () {
  'use strict';

  // --- Menu mobile ---------------------------------------------------------
  var burger = document.querySelector('.burger');
  var nav = document.getElementById('nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    });
  }

  // --- Menus déroulants (Émissions / Thèmes) -------------------------------
  var menuBtns = [].slice.call(document.querySelectorAll('.menu-btn'));
  var closeMenus = function (except) {
    menuBtns.forEach(function (b) {
      if (b === except) return;
      b.setAttribute('aria-expanded', 'false');
      var panel = document.getElementById(b.getAttribute('aria-controls'));
      if (panel) panel.hidden = true;
    });
  };
  menuBtns.forEach(function (btn) {
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = btn.getAttribute('aria-expanded') === 'true';
      closeMenus(btn);
      btn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
  });
  if (menuBtns.length) {
    document.addEventListener('click', function () { closeMenus(null); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenus(null);
    });
  }

  // --- Lecteur YouTube différé (chargé au clic, pas au chargement) ----------
  var player = document.querySelector('.player');
  if (player) {
    var load = function (start) {
      var id = player.getAttribute('data-video');
      var title = player.getAttribute('data-title') || 'Vidéo';
      var src = 'https://www.youtube-nocookie.com/embed/' + id
        + '?autoplay=1&rel=0&modestbranding=1&hl=fr';
      if (start > 0) src += '&start=' + start;
      var iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = title;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      iframe.setAttribute('loading', 'lazy');
      player.innerHTML = '';
      player.appendChild(iframe);
    };
    // Un lien « moment clé » (…/?t=320) démarre la lecture au bon endroit.
    var urlStart = parseInt((location.search.match(/[?&]t=(\d+)/) || [])[1], 10) || 0;

    player.addEventListener('click', function () { load(urlStart); });
    player.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); load(urlStart); }
    });

    // Sommaire : on lance la lecture sur place, au chapitre choisi.
    document.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('[data-seek]') : null;
      if (!link) return;
      e.preventDefault();
      load(parseInt(link.getAttribute('data-seek'), 10) || 0);
      var top = player.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top: top < 0 ? 0 : top, behavior: 'smooth' });
    });
  }

  // --- Recherche -----------------------------------------------------------
  var results = document.getElementById('search-results');
  if (!results) return;

  var input = document.getElementById('q');
  var count = document.getElementById('search-count');
  var empty = document.getElementById('search-empty');
  var index = null;

  var normalize = function (s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  };

  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var fmtDate = function (iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return ''; }
  };

  var fmtDur = function (s) {
    if (!s) return '';
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return h ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
  };

  var card = function (v) {
    return '<article class="card">'
      + '<a class="card-thumb" href="/video/' + v.i + '/">'
      + '<img src="' + esc(v.n || ('https://i.ytimg.com/vi/' + v.i + '/hqdefault.jpg')) + '" alt="" loading="lazy" width="480" height="270">'
      + (v.u ? '<span class="badge-duration">' + fmtDur(v.u) + '</span>' : '')
      + '<span class="card-play" aria-hidden="true"></span></a>'
      + '<div class="card-body">'
      + (v.c ? '<a class="card-cat" href="/emissions/' + v.s + '/">' + esc(v.c) + '</a>' : '')
      + '<h3 class="card-title"><a href="/video/' + v.i + '/">' + esc(v.t) + '</a></h3>'
      + '<p class="card-meta">' + fmtDate(v.p) + '</p>'
      + '</div></article>';
  };

  var run = function (query) {
    if (!index) return;
    var q = normalize(query).trim();
    if (!q) {
      results.innerHTML = '';
      if (count) count.textContent = '';
      if (empty) empty.hidden = true;
      return;
    }
    var terms = q.split(/\s+/);
    var hits = index.filter(function (v) {
      var hay = v._h || (v._h = normalize(v.t + ' ' + v.d + ' ' + v.c));
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    });
    results.innerHTML = hits.slice(0, 60).map(card).join('');
    if (count) {
      count.textContent = hits.length
        ? hits.length + ' résultat' + (hits.length > 1 ? 's' : '') + ' pour « ' + query.trim() + ' »'
        : '';
    }
    if (empty) empty.hidden = hits.length > 0;
  };

  var debounce;
  fetch('/search.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      index = data;
      var q = new URLSearchParams(location.search).get('q');
      if (q) { if (input) input.value = q; run(q); }
    })
    .catch(function () {
      if (count) count.textContent = "La recherche n'est pas disponible pour le moment.";
    });

  if (input) {
    input.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () { run(input.value); }, 120);
    });
  }
  var form = document.querySelector('.search-big');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      run(input.value);
      history.replaceState(null, '', '/recherche/?q=' + encodeURIComponent(input.value));
    });
  }
})();
