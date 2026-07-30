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
  // --- Lecteur vidéo : reprise, partage à la minute, suite automatique ------
  var STORE = 'ttv-progress';
  var readStore = function () {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; }
  };
  var writeStore = function (data) {
    try { localStorage.setItem(STORE, JSON.stringify(data)); } catch (e) { /* mode privé */ }
  };
  var fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s2) : m + ':' + pad(s2);
  };

  var player = document.querySelector('.player');
  if (player) {
    var vid = player.getAttribute('data-video');
    var vtitle = player.getAttribute('data-title') || 'Vidéo';
    var ytPlayer = null;
    var saveTimer = null;

    var urlStart = parseInt((location.search.match(/[?&]t=(\d+)/) || [])[1], 10) || 0;
    var store = readStore();
    var saved = store[vid] && store[vid].t ? Math.floor(store[vid].t) : 0;

    // Proposition de reprise (seulement si l'arrêt est significatif)
    var bar = document.getElementById('resume-bar');
    if (bar && !urlStart && saved > 30) {
      document.getElementById('resume-time').textContent = fmtTime(saved);
      bar.hidden = false;
      document.getElementById('resume-btn').addEventListener('click', function () {
        bar.hidden = true; start(saved);
      });
      document.getElementById('resume-restart').addEventListener('click', function () {
        bar.hidden = true; start(0);
      });
    }

    var remember = function (t, duration) {
      var data = readStore();
      // Vidéo terminée (ou presque) : on oublie, elle n'a plus à être reprise.
      if (duration && t > duration - 25) { delete data[vid]; }
      else { data[vid] = { t: Math.floor(t), d: Math.floor(duration || 0), u: Date.now(), n: vtitle }; }
      var keys = Object.keys(data);
      if (keys.length > 40) {
        keys.sort(function (a, b) { return (data[a].u || 0) - (data[b].u || 0); });
        keys.slice(0, keys.length - 40).forEach(function (k) { delete data[k]; });
      }
      writeStore(data);
    };

    var showNext = function () {
      var nid = player.getAttribute('data-next-id');
      if (!nid) return;
      var card = document.createElement('div');
      card.className = 'next-up';
      card.innerHTML = '<p class="next-up-label">À suivre</p>'
        + '<img alt="">'
        + '<p class="next-up-title"></p>'
        + '<p class="next-up-count">Lecture dans <span>8</span> s</p>'
        + '<a class="btn btn-primary">Regarder maintenant</a>'
        + '<button class="btn" type="button">Rester ici</button>';
      card.querySelector('img').src = player.getAttribute('data-next-thumb') || '';
      card.querySelector('.next-up-title').textContent = player.getAttribute('data-next-title') || '';
      card.querySelector('a').href = '/video/' + nid + '/';
      player.appendChild(card);
      var n = 8;
      var span = card.querySelector('.next-up-count span');
      var tick = setInterval(function () {
        n -= 1; span.textContent = n;
        if (n <= 0) { clearInterval(tick); location.href = '/video/' + nid + '/'; }
      }, 1000);
      card.querySelector('button').addEventListener('click', function () {
        clearInterval(tick); card.remove();
      });
    };

    var onReady = function () {
      var shareBtn = document.getElementById('share-at-time');
      if (shareBtn) {
        shareBtn.hidden = false;
        shareBtn.addEventListener('click', function () {
          var t = ytPlayer && ytPlayer.getCurrentTime ? Math.floor(ytPlayer.getCurrentTime()) : 0;
          var link = location.origin + location.pathname + '?t=' + t;
          var done = function () {
            var old = shareBtn.textContent;
            shareBtn.textContent = 'Lien copié (' + fmtTime(t) + ')';
            setTimeout(function () { shareBtn.textContent = old; }, 2500);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(done, function () { window.prompt('Copiez ce lien :', link); });
          } else { window.prompt('Copiez ce lien :', link); }
        });
      }
      saveTimer = setInterval(function () {
        if (!ytPlayer || !ytPlayer.getCurrentTime) return;
        if (ytPlayer.getPlayerState && ytPlayer.getPlayerState() !== 1) return;
        remember(ytPlayer.getCurrentTime(), ytPlayer.getDuration ? ytPlayer.getDuration() : 0);
      }, 5000);
    };

    var buildPlayer = function (from) {
      var holder = document.createElement('div');
      player.innerHTML = '';
      player.appendChild(holder);
      ytPlayer = new window.YT.Player(holder, {
        host: 'https://www.youtube-nocookie.com',
        videoId: vid,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, hl: 'fr', start: from || 0 },
        events: {
          onReady: onReady,
          onStateChange: function (e) {
            if (e.data === 0) { // terminée
              if (saveTimer) clearInterval(saveTimer);
              remember(1e9, 1);
              showNext();
            }
          },
        },
      });
    };

    var start = function (from) {
      if (window.YT && window.YT.Player) { buildPlayer(from); return; }
      window.onYouTubeIframeAPIReady = function () { buildPlayer(from); };
      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    };

    player.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.next-up')) return;
      if (!ytPlayer) start(urlStart);
    });
    player.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && !ytPlayer) { e.preventDefault(); start(urlStart); }
    });

    // Liens du sommaire : lecture sur place, au chapitre choisi.
    document.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('[data-seek]') : null;
      if (!link) return;
      e.preventDefault();
      var sec = parseInt(link.getAttribute('data-seek'), 10) || 0;
      if (ytPlayer && ytPlayer.seekTo) { ytPlayer.seekTo(sec, true); ytPlayer.playVideo(); }
      else { start(sec); }
      var top = player.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top: top < 0 ? 0 : top, behavior: 'smooth' });
    });
  }

  // --- Reprendre la lecture : rappel discret sur les grilles ---------------
  (function () {
    var data = readStore();
    var ids = Object.keys(data);
    if (!ids.length) return;
    ids.forEach(function (id) {
      var entry = data[id];
      if (!entry || !entry.d || !entry.t) return;
      var pct = Math.min(100, Math.round((entry.t / entry.d) * 100));
      if (pct < 3 || pct > 95) return;
      document.querySelectorAll('[data-video-id="' + id + '"] .card-progress').forEach(function (el) {
        el.hidden = false;
        el.firstElementChild.style.width = pct + '%';
      });
    });
  })();

  // --- Alertes du navigateur (page « Suivre ») ------------------------------
  var pushBtn = document.getElementById('push-optin');
  if (pushBtn) {
    var pushStatus = document.getElementById('push-status');
    var pushIos = document.getElementById('push-ios');
    var say = function (msg) { if (pushStatus) pushStatus.textContent = msg; };

    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var standalone = window.navigator.standalone === true
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    var supported = ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window);

    if (isIOS && !standalone) {
      // Sur iPhone hors écran d'accueil : on explique au lieu de proposer l'impossible.
      if (pushIos) { pushIos.hidden = false; pushIos.open = true; }
      say('Les alertes ne sont pas disponibles depuis un onglet Safari.');
    } else if (!supported) {
      say("Votre navigateur ne gère pas les alertes. Le flux RSS ou la chaîne YouTube prennent le relais.");
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      say("Les notifications sont actuellement bloquées pour ce site dans votre navigateur. Pour les autoriser : cliquez sur l'icône à gauche de l'adresse, puis activez les notifications.");
    } else {
      pushBtn.hidden = false;
      if (isIOS) { if (pushIos) pushIos.hidden = false; }

      var refresh = function (OneSignal) {
        try {
          if (OneSignal.User.PushSubscription.optedIn) {
            pushBtn.textContent = 'Ne plus recevoir les alertes';
            pushBtn.dataset.state = 'on';
            say('Vous recevez les alertes sur cet appareil.');
          } else {
            pushBtn.textContent = 'Recevoir les alertes';
            pushBtn.dataset.state = 'off';
            say('');
          }
        } catch (e) { /* SDK pas encore prêt */ }
      };

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(function (OneSignal) {
        refresh(OneSignal);
        try {
          OneSignal.User.PushSubscription.addEventListener('change', function () { refresh(OneSignal); });
        } catch (e) { /* selon version du SDK */ }
      });

      pushBtn.addEventListener('click', function () {
        pushBtn.disabled = true;
        say('Un instant…');
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async function (OneSignal) {
          try {
            if (pushBtn.dataset.state === 'on') {
              await OneSignal.User.PushSubscription.optOut();
              say('Vous ne recevez plus les alertes.');
            } else {
              await OneSignal.User.PushSubscription.optIn();
            }
          } catch (e) {
            say("La demande n'a pas abouti. Vérifiez que votre navigateur n'a pas bloqué les notifications pour ce site.");
          }
          pushBtn.disabled = false;
          refresh(OneSignal);
        });
      });
    }
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

/* ---------------------------------------------------------------------------
 * Rattrapage des anciennes adresses (page 404)
 *
 * Le site a remplacé un blog Wix dont les adresses (/post/mon-titre) restent
 * dans l'index de Google, dans les partages Facebook et dans les marque-pages
 * des visiteurs. Plutôt que de leur opposer un mur, la page d'erreur lit
 * l'adresse demandée, la compare aux titres du catalogue et propose — ou
 * ouvre directement — la vidéo correspondante.
 * ------------------------------------------------------------------------- */
(function () {
  var box = document.getElementById('e404-rescue');
  if (!box) return;

  var results = document.getElementById('e404-results');
  var lede = document.getElementById('e404-lede');
  var title = document.getElementById('e404-rescue-title');

  var normalize = function (s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  };

  // Mots sans valeur discriminante : ils feraient correspondre n'importe quoi.
  var STOP = ' le la les un une des du de d l au aux et ou en dans sur pour par avec sans '
    + 'post posts blog article page video videos emission emissions fr en index html php '
    + 'a as at the of to is it ce ces cet cette qui que quoi son sa ses nos vos leur ';

  var words = function (s) {
    return normalize(s).split(' ').filter(function (w) {
      return w.length > 2 && STOP.indexOf(' ' + w + ' ') === -1;
    });
  };

  var asked = words(decodeURIComponent(location.pathname));
  if (asked.length === 0) return;

  var card = function (v) {
    var thumb = v.n || ('https://i.ytimg.com/vi/' + v.i + '/hqdefault.jpg');
    var el = document.createElement('article');
    el.className = 'card';
    el.innerHTML =
      '<a class="card-thumb" href="/video/' + v.i + '/">'
      + '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" width="480" height="270">'
      + '<span class="card-play" aria-hidden="true"></span></a>'
      + '<div class="card-body">'
      + (v.c ? '<a class="card-cat" href="/emissions/' + v.s + '/">' + v.c + '</a>' : '')
      + '<h3 class="card-title"><a href="/video/' + v.i + '/"></a></h3>'
      + '</div>';
    el.querySelector('.card-title a').textContent = v.t;
    return el;
  };

  fetch('/search.json').then(function (r) { return r.json(); }).then(function (index) {
    var scored = index.map(function (v) {
      var have = words(v.t + ' ' + (v.c || ''));
      var hits = 0;
      asked.forEach(function (w) {
        for (var i = 0; i < have.length; i++) {
          // Correspondance souple : « antisemitisme » retrouve « antisemitismes ».
          // Le préfixe doit faire au moins quatre lettres, sinon « mer » (Mer
          // Morte) accrocherait « merci » et l'on proposerait n'importe quoi.
          if (have[i] === w
            || (w.length >= 4 && have[i].indexOf(w) === 0)
            || (have[i].length >= 4 && w.indexOf(have[i]) === 0)) { hits++; return; }
        }
      });
      return { v: v, score: hits / asked.length, hits: hits };
    }).filter(function (r) { return r.score > 0.34; })
      .sort(function (a, b) { return b.score - a.score; });

    if (scored.length === 0) {
      // Aucune piste : au moins emmener le visiteur vers la recherche.
      var q = asked.join(' ');
      var p = document.getElementById('e404-actions');
      if (p) {
        var a = document.createElement('a');
        a.className = 'btn';
        a.href = '/recherche/?q=' + encodeURIComponent(q);
        a.textContent = 'Chercher « ' + q + ' »';
        p.appendChild(document.createTextNode(' '));
        p.appendChild(a);
      }
      return;
    }

    // Une ancienne adresse de rubrique doit conduire à la rubrique, pas à
    // l'une de ses vidéos : on teste d'abord les noms d'émissions et de thèmes.
    var seen = {};
    var cats = [];
    index.forEach(function (v) {
      if (v.s && !seen[v.s]) { seen[v.s] = 1; cats.push({ t: v.c, s: v.s }); }
    });
    var catHit = cats.map(function (c) {
      var have = words(c.t);
      var hits = 0;
      asked.forEach(function (w) {
        for (var i = 0; i < have.length; i++) {
          if (have[i] === w
            || (w.length >= 4 && have[i].indexOf(w) === 0)
            || (have[i].length >= 4 && w.indexOf(have[i]) === 0)) { hits++; return; }
        }
      });
      return { c: c, score: hits / asked.length, hits: hits };
    }).sort(function (a, b) { return b.score - a.score; })[0];

    if (catHit && catHit.score >= 0.8 && catHit.hits >= 2) {
      location.replace('/emissions/' + catHit.c.s + '/');
      return;
    }

    var best = scored[0];
    var second = scored[1] ? scored[1].score : 0;

    // Correspondance franche et sans rivale : on y conduit directement.
    // replace() et non assign() : le bouton « retour » ne doit pas ramener
    // le visiteur sur la page d'erreur.
    if (best.score >= 0.8 && best.hits >= 3 && best.score - second >= 0.2) {
      location.replace('/video/' + best.v.i + '/');
      return;
    }

    if (lede) lede.textContent = 'Cette adresse date de l’ancien site. Voici ce qui s’en rapproche le plus.';
    if (title) title.textContent = scored.length === 1 ? 'Vous cherchiez peut-être' : 'Vous cherchiez peut-être l’une de ces vidéos';
    scored.slice(0, 4).forEach(function (r) { results.appendChild(card(r.v)); });
    box.hidden = false;
  }).catch(function () { /* silence : la page d'erreur reste utilisable */ });
})();

/* ---------------------------------------------------------------------------
 * Installation sur l'écran d'accueil
 *
 * Le site est installable depuis la v13 (manifeste + agent de service), mais
 * rien ne le disait. Ici : le bouton d'installation natif quand le navigateur
 * le permet, et un bandeau proposé aux visiteurs qui reviennent — jamais à la
 * première visite, jamais deux fois s'il a été écarté.
 * ------------------------------------------------------------------------- */
(function () {
  var KEY = 'ttv-install';
  var read = function () {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  };
  var write = function (d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* navigation privée */ }
  };

  var installed = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  var state = read();
  state.visits = (state.visits || 0) + 1;
  write(state);

  var done = document.getElementById('install-done');
  if (installed) {
    if (done) done.hidden = false;
    ['how-android', 'how-ios', 'how-desktop'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    return;
  }

  // Chrome et Edge préviennent quand l'installation est possible : on garde
  // l'événement sous le coude pour déclencher la vraie fenêtre du navigateur.
  var prompt = null;
  var cta = document.getElementById('install-cta');
  var bar = document.getElementById('install-bar');

  var offer = function () {
    if (cta) cta.hidden = false;
    // Le bandeau n'apparaît qu'à partir de la troisième visite, et jamais s'il
    // a déjà été écarté : proposer trop tôt, c'est se faire refuser une fois
    // pour toutes.
    if (bar && !state.dismissed && (state.visits || 0) >= 3
      && location.pathname !== '/installer/') {
      bar.hidden = false;
    }
  };

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    prompt = e;
    offer();
  });

  var launch = function () {
    if (!prompt) { location.href = '/installer/'; return; }
    prompt.prompt();
    prompt.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') {
        state.dismissed = true;
        write(state);
        if (bar) bar.hidden = true;
      }
      prompt = null;
    });
  };

  ['install-now', 'install-go'].forEach(function (id) {
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', launch);
  });

  var close = document.getElementById('install-close');
  if (close) {
    close.addEventListener('click', function () {
      state.dismissed = true;
      write(state);
      if (bar) bar.hidden = true;
    });
  }

  // iPhone et iPad n'émettent jamais « beforeinstallprompt » : Safari n'a pas
  // d'installation programmatique. On propose donc le mode d'emploi.
  var ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    var go = document.getElementById('install-go');
    if (go) go.hidden = true;
    offer();
  }
})();
