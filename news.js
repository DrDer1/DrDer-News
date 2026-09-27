(function () {
  'use strict';

  var ARABIC_CHAR_PATTERN = /[\u0600-\u06FF]/;

  function detectDirection(text) {
    if (text && ARABIC_CHAR_PATTERN.test(text)) {
      return 'rtl';
    }
    return 'ltr';
  }

  function detectLanguage(text) {
    if (text && ARABIC_CHAR_PATTERN.test(text)) {
      return 'ar';
    }
    return 'en';
  }

  function getElementText(parentEl, tagNames) {
    for (var i = 0; i < tagNames.length; i++) {
      var found = parentEl.getElementsByTagName(tagNames[i])[0];
      if (found && found.textContent) {
        return found.textContent.trim();
      }
    }
    return '';
  }

  function stripHtmlToText(htmlString) {
    if (!htmlString) {
      return '';
    }
    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(htmlString, 'text/html');
      return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    } catch (error) {
      return htmlString.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  function extractFirstImageFromHtml(htmlString) {
    if (!htmlString) {
      return '';
    }
    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(htmlString, 'text/html');
      var imgEl = doc.querySelector('img[src]');
      if (imgEl) {
        var src = imgEl.getAttribute('src');
        if (src && /^https?:\/\//i.test(src)) {
          return src;
        }
      }
    } catch (error) {
      // ignore, no image found
    }
    return '';
  }

  function extractImage(itemEl, rawDescriptionHtml) {
    var mediaContentEls = itemEl.getElementsByTagNameNS('*', 'content');
    for (var i = 0; i < mediaContentEls.length; i++) {
      var el = mediaContentEls[i];
      var medium = el.getAttribute('medium');
      var url = el.getAttribute('url');
      var type = el.getAttribute('type') || '';
      if (url && (medium === 'image' || type.indexOf('image') === 0 || !medium)) {
        if (medium !== 'video' && type.indexOf('video') !== 0) {
          return url;
        }
      }
    }

    var mediaThumbnailEls = itemEl.getElementsByTagNameNS('*', 'thumbnail');
    if (mediaThumbnailEls.length > 0) {
      var thumbUrl = mediaThumbnailEls[0].getAttribute('url');
      if (thumbUrl) {
        return thumbUrl;
      }
    }

    var enclosureEls = itemEl.getElementsByTagName('enclosure');
    for (var j = 0; j < enclosureEls.length; j++) {
      var enclosureType = enclosureEls[j].getAttribute('type') || '';
      var enclosureUrl = enclosureEls[j].getAttribute('url');
      if (enclosureUrl && enclosureType.indexOf('image') === 0) {
        return enclosureUrl;
      }
    }

    var imageFromDescription = extractFirstImageFromHtml(rawDescriptionHtml);
    if (imageFromDescription) {
      return imageFromDescription;
    }

    return '';
  }

  function extractVideo(itemEl) {
    var mediaContentEls = itemEl.getElementsByTagNameNS('*', 'content');
    for (var i = 0; i < mediaContentEls.length; i++) {
      var el = mediaContentEls[i];
      var medium = el.getAttribute('medium');
      var type = el.getAttribute('type') || '';
      var url = el.getAttribute('url');
      if (url && (medium === 'video' || type.indexOf('video') === 0)) {
        return url;
      }
    }

    var enclosureEls = itemEl.getElementsByTagName('enclosure');
    for (var j = 0; j < enclosureEls.length; j++) {
      var enclosureType = enclosureEls[j].getAttribute('type') || '';
      var enclosureUrl = enclosureEls[j].getAttribute('url');
      if (enclosureUrl && enclosureType.indexOf('video') === 0) {
        return enclosureUrl;
      }
    }

    return '';
  }

  function extractAtomLink(entryEl) {
    var linkEls = entryEl.getElementsByTagName('link');
    var fallbackHref = '';
    for (var i = 0; i < linkEls.length; i++) {
      var relAttr = linkEls[i].getAttribute('rel');
      var hrefAttr = linkEls[i].getAttribute('href');
      if (!hrefAttr) {
        continue;
      }
      if (!relAttr || relAttr === 'alternate') {
        return hrefAttr;
      }
      if (!fallbackHref) {
        fallbackHref = hrefAttr;
      }
    }
    return fallbackHref;
  }

  function simpleHash(inputString) {
    var hash = 0;
    for (var i = 0; i < inputString.length; i++) {
      hash = (hash << 5) - hash + inputString.charCodeAt(i);
      hash |= 0;
    }
    return 'fp' + Math.abs(hash);
  }

  function buildArticleId(guid, link, sourceName, title) {
    if (guid) {
      return guid;
    }
    if (link) {
      return link;
    }
    return simpleHash(sourceName + '|' + title);
  }

  function normalizeRssItem(itemEl, sourceName) {
    var title = getElementText(itemEl, ['title']);
    var link = getElementText(itemEl, ['link']);
    var rawDescription = '';
    var descriptionEl =
      itemEl.getElementsByTagName('description')[0] ||
      itemEl.getElementsByTagNameNS('*', 'encoded')[0];
    if (descriptionEl && descriptionEl.textContent) {
      rawDescription = descriptionEl.textContent.trim();
    }

    var pubDateRaw = getElementText(itemEl, ['pubDate', 'published', 'date']);
    var guid = getElementText(itemEl, ['guid']);

    var summaryText = stripHtmlToText(rawDescription);
    if (summaryText.length > 280) {
      summaryText = summaryText.slice(0, 277).trim() + '...';
    }

    var image = extractImage(itemEl, rawDescription);
    var video = extractVideo(itemEl);
    var pubDateIso = parseDateToIso(pubDateRaw);
    var direction = detectDirection(title || summaryText);
    var language = detectLanguage(title || summaryText);

    return {
      id: buildArticleId(guid, link, sourceName, title),
      title: title,
      summary: summaryText,
      link: link,
      pubDate: pubDateIso,
      source: sourceName,
      image: image,
      video: video,
      language: language,
      direction: direction
    };
  }

  function normalizeAtomEntry(entryEl, sourceName) {
    var title = getElementText(entryEl, ['title']);
    var link = extractAtomLink(entryEl);
    var rawDescription = '';
    var summaryEl =
      entryEl.getElementsByTagName('summary')[0] ||
      entryEl.getElementsByTagName('content')[0];
    if (summaryEl && summaryEl.textContent) {
      rawDescription = summaryEl.textContent.trim();
    }

    var pubDateRaw = getElementText(entryEl, ['updated', 'published']);
    var guid = getElementText(entryEl, ['id']);

    var summaryText = stripHtmlToText(rawDescription);
    if (summaryText.length > 280) {
      summaryText = summaryText.slice(0, 277).trim() + '...';
    }

    var image = extractImage(entryEl, rawDescription);
    var video = extractVideo(entryEl);
    var pubDateIso = parseDateToIso(pubDateRaw);
    var direction = detectDirection(title || summaryText);
    var language = detectLanguage(title || summaryText);

    return {
      id: buildArticleId(guid, link, sourceName, title),
      title: title,
      summary: summaryText,
      link: link,
      pubDate: pubDateIso,
      source: sourceName,
      image: image,
      video: video,
      language: language,
      direction: direction
    };
  }

  function parseDateToIso(rawDateString) {
    if (!rawDateString) {
      return '';
    }
    var parsedDate = new Date(rawDateString);
    if (isNaN(parsedDate.getTime())) {
      return '';
    }
    return parsedDate.toISOString();
  }

  function parseFeedDocument(xmlDoc, sourceName) {
    var articles = [];

    var parserErrorEl = xmlDoc.getElementsByTagName('parsererror')[0];
    if (parserErrorEl) {
      throw new Error('XML parse error for source: ' + sourceName);
    }

    var rssItems = xmlDoc.getElementsByTagName('item');
    if (rssItems.length > 0) {
      for (var i = 0; i < rssItems.length; i++) {
        articles.push(normalizeRssItem(rssItems[i], sourceName));
      }
      return articles;
    }

    var atomEntries = xmlDoc.getElementsByTagName('entry');
    for (var j = 0; j < atomEntries.length; j++) {
      articles.push(normalizeAtomEntry(atomEntries[j], sourceName));
    }
    return articles;
  }

  function fetchSingleSource(sourceConfig) {
    return fetch(sourceConfig.url, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' for ' + sourceConfig.name);
        }
        return response.text();
      })
      .then(function (xmlText) {
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        return parseFeedDocument(xmlDoc, sourceConfig.name);
      })
      .then(function (articles) {
        return { success: true, sourceName: sourceConfig.name, articles: articles };
      })
      .catch(function (error) {
        console.error('DrDer News: source failed -', sourceConfig.name, error);
        return { success: false, sourceName: sourceConfig.name, articles: [] };
      });
  }

  function deduplicateArticles(articleList, previousSeenIds) {
    var seenIdSet = new Set(previousSeenIds || []);
    var seenInThisBatch = new Set();
    var deduplicated = [];

    articleList.forEach(function (article) {
      if (!article.title || !article.id) {
        return;
      }
      if (seenInThisBatch.has(article.id)) {
        return;
      }
      seenInThisBatch.add(article.id);
      deduplicated.push(article);
    });

    return deduplicated;
  }

  function fetchAllNews(sourceConfigs, previousSeenIds) {
    var fetchPromises = sourceConfigs.map(function (sourceConfig) {
      return fetchSingleSource(sourceConfig);
    });

    return Promise.all(fetchPromises).then(function (results) {
      var succeededSourceCount = 0;
      var failedSourceCount = 0;
      var combinedArticles = [];

      results.forEach(function (result) {
        if (result.success) {
          succeededSourceCount++;
          combinedArticles = combinedArticles.concat(result.articles);
        } else {
          failedSourceCount++;
        }
      });

      var deduplicatedArticles = deduplicateArticles(combinedArticles, previousSeenIds);

      return {
        articles: deduplicatedArticles,
        succeededSourceCount: succeededSourceCount,
        failedSourceCount: failedSourceCount
      };
    });
  }

  window.NewsService = {
    fetchAllNews: fetchAllNews
  };
})();
