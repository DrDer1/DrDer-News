(function () {
  'use strict';

  var REFRESH_INTERVAL_MS = 3 * 60 * 1000; // ~3 minutes

  var STORAGE_KEYS = {
    NEWS: 'drderNews_articles',
    SEEN_IDS: 'drderNews_seenIds',
    STORED_DATE: 'drderNews_storedDate'
  };

  var newsListEl = document.getElementById('newsList');
  var loadingStateEl = document.getElementById('loadingState');
  var emptyStateEl = document.getElementById('emptyState');
  var statusBarEl = document.getElementById('statusBar');
  var refreshButtonEl = document.getElementById('refreshButton');
  var cardTemplate = document.getElementById('newsCardTemplate');

  var currentArticles = [];
  var currentRenderedIds = [];
  var isFetching = false;
  var refreshTimerId = null;

  function getTodayDateString() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function readStoredDate() {
    try {
      return localStorage.getItem(STORAGE_KEYS.STORED_DATE);
    } catch (error) {
      console.error('DrDer News: failed to read stored date', error);
      return null;
    }
  }

  function writeStoredDate(dateString) {
    try {
      localStorage.setItem(STORAGE_KEYS.STORED_DATE, dateString);
    } catch (error) {
      console.error('DrDer News: failed to write stored date', error);
    }
  }

  function readStoredArticles() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.NEWS);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('DrDer News: failed to read stored articles', error);
      return [];
    }
  }

  function writeStoredArticles(articles) {
    try {
      localStorage.setItem(STORAGE_KEYS.NEWS, JSON.stringify(articles));
    } catch (error) {
      console.error('DrDer News: failed to write stored articles', error);
    }
  }

  function readSeenIds() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.SEEN_IDS);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('DrDer News: failed to read seen ids', error);
      return [];
    }
  }

  function writeSeenIds(ids) {
    try {
      localStorage.setItem(STORAGE_KEYS.SEEN_IDS, JSON.stringify(ids));
    } catch (error) {
      console.error('DrDer News: failed to write seen ids', error);
    }
  }

  function clearStoredDayData() {
    try {
      localStorage.removeItem(STORAGE_KEYS.NEWS);
      localStorage.removeItem(STORAGE_KEYS.SEEN_IDS);
    } catch (error) {
      console.error('DrDer News: failed to clear stored day data', error);
    }
  }

  function checkAndHandleDayChange() {
    var todayString = getTodayDateString();
    var storedDateString = readStoredDate();

    if (storedDateString !== todayString) {
      clearStoredDayData();
      writeStoredDate(todayString);
      currentArticles = [];
      return true;
    }
    return false;
  }

  function setStatus(message, isError) {
    statusBarEl.textContent = message || '';
    statusBarEl.classList.toggle('status-error', Boolean(isError));
  }

  function formatTimeLabel(pubDateIso) {
    if (!pubDateIso) {
      return '';
    }
    var date = new Date(pubDateIso);
    if (isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString('ar', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function buildNewsCard(article) {
    var cardFragment = cardTemplate.content.cloneNode(true);
    var cardEl = cardFragment.querySelector('.news-card');
    var imageLinkEl = cardFragment.querySelector('.news-card-image-link');
    var imageEl = cardFragment.querySelector('.news-card-image');
    var sourceEl = cardFragment.querySelector('.news-card-source');
    var timeEl = cardFragment.querySelector('.news-card-time');
    var titleEl = cardFragment.querySelector('.news-card-title');
    var summaryEl = cardFragment.querySelector('.news-card-summary');
    var linkEl = cardFragment.querySelector('.news-card-link');

    var direction = article.direction === 'rtl' ? 'rtl' : 'ltr';
    cardEl.setAttribute('dir', direction);
    if (article.language) {
      cardEl.setAttribute('lang', article.language);
    }

    if (article.image) {
      imageEl.src = article.image;
      imageEl.alt = article.title || '';
      imageLinkEl.href = article.link || '#';
    } else {
      imageLinkEl.remove();
    }

    sourceEl.textContent = article.source || '';
    timeEl.textContent = formatTimeLabel(article.pubDate);
    titleEl.textContent = article.title || '';
    summaryEl.textContent = article.summary || '';

    if (article.link) {
      linkEl.href = article.link;
    } else {
      linkEl.remove();
    }

    return cardFragment;
  }

  function renderArticles(articles) {
    var newIds = articles.map(function (article) {
      return article.id;
    });

    var idsUnchanged =
      newIds.length === currentRenderedIds.length &&
      newIds.every(function (id, index) {
        return id === currentRenderedIds[index];
      });

    if (idsUnchanged) {
      return;
    }

    newsListEl.textContent = '';

    if (articles.length === 0) {
      emptyStateEl.hidden = false;
    } else {
      emptyStateEl.hidden = true;
      articles.forEach(function (article) {
        newsListEl.appendChild(buildNewsCard(article));
      });
    }

    currentRenderedIds = newIds;
  }

  function showLoadingState(isLoading) {
    loadingStateEl.hidden = !isLoading || currentArticles.length > 0;
  }

  function mergeArticles(freshArticles, existingArticles) {
    var mergedById = new Map();

    freshArticles.forEach(function (article) {
      mergedById.set(article.id, article);
    });

    existingArticles.forEach(function (article) {
      if (!mergedById.has(article.id)) {
        mergedById.set(article.id, article);
      }
    });

    var merged = Array.from(mergedById.values());
    merged.sort(function (a, b) {
      var timeA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      var timeB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return timeB - timeA;
    });

    return merged;
  }

  function refreshNews(isManual) {
    if (isFetching) {
      return;
    }
    isFetching = true;
    refreshButtonEl.classList.add('is-refreshing');
    refreshButtonEl.disabled = true;

    if (checkAndHandleDayChange()) {
      renderArticles(currentArticles);
    }

    showLoadingState(true);
    setStatus(isManual ? 'جاري التحديث...' : 'جاري تحديث الأخبار...', false);

    var previousSeenIds = readSeenIds();

    window.NewsService.fetchAllNews(window.NEWS_SOURCES, previousSeenIds)
      .then(function (result) {
        console.log(
          'DrDer News: sources succeeded =', result.succeededSourceCount,
          '/ failed =', result.failedSourceCount,
          '/ new articles fetched =', result.articles.length
        );

        currentArticles = mergeArticles(result.articles, currentArticles);

        writeStoredArticles(currentArticles);
        writeSeenIds(currentArticles.map(function (article) {
          return article.id;
        }));
        writeStoredDate(getTodayDateString());

        renderArticles(currentArticles);
        showLoadingState(false);

        if (result.succeededSourceCount === 0) {
          setStatus('تعذر الوصول إلى مصادر الأخبار. راجع اتصالك بالإنترنت.', true);
        } else if (currentArticles.length === 0) {
          setStatus('تم الاتصال بالمصادر لكن لم تُعثر أخبار جديدة.', true);
        } else if (result.failedSourceCount > 0) {
          setStatus('تم التحديث - ' + result.failedSourceCount + ' مصدر غير متاح حاليًا', false);
        } else {
          setStatus('آخر تحديث: الآن', false);
        }
      })
      .catch(function (error) {
        console.error('DrDer News: refresh failed', error);
        showLoadingState(false);
        if (currentArticles.length === 0) {
          setStatus('تعذر تحميل الأخبار. تحقق من اتصالك بالإنترنت.', true);
        } else {
          setStatus('تعذر التحديث. يتم عرض آخر أخبار محفوظة.', true);
        }
      })
      .finally(function () {
        isFetching = false;
        refreshButtonEl.classList.remove('is-refreshing');
        refreshButtonEl.disabled = false;
        // Safety net: never leave the loading screen stuck no matter what happens above.
        showLoadingState(false);
      });
  }

  function scheduleAutoRefresh() {
    if (refreshTimerId) {
      clearInterval(refreshTimerId);
    }
    refreshTimerId = setInterval(function () {
      refreshNews(false);
    }, REFRESH_INTERVAL_MS);
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      if (checkAndHandleDayChange()) {
        renderArticles(currentArticles);
      }
      refreshNews(false);
    }
  }

  function handleOnline() {
    setStatus('تم استعادة الاتصال - جاري التحديث...', false);
    refreshNews(false);
  }

  function handleOffline() {
    setStatus('أنت غير متصل بالإنترنت. يتم عرض آخر أخبار محفوظة.', true);
  }

  function initializeFromStorage() {
    checkAndHandleDayChange();
    currentArticles = readStoredArticles();
    renderArticles(currentArticles);
    showLoadingState(currentArticles.length === 0);
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function (error) {
        console.error('DrDer News: service worker registration failed', error);
      });
    }
  }

  function init() {
    initializeFromStorage();
    registerServiceWorker();

    refreshButtonEl.addEventListener('click', function () {
      refreshNews(true);
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    scheduleAutoRefresh();
    refreshNews(false);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
