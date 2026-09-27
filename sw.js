'use strict';

var APP_SHELL_CACHE_NAME = 'drder-news-shell-v1';

var APP_SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './news.js',
  './sources.js',
  './manifest.json',
  './192.png',
  './512.png'
];

self.addEventListener('install', function (installEvent) {
  installEvent.waitUntil(
    caches.open(APP_SHELL_CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL_FILES);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (activateEvent) {
  activateEvent.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (cacheName) {
            return cacheName !== APP_SHELL_CACHE_NAME;
          })
          .map(function (cacheName) {
            return caches.delete(cacheName);
          })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (fetchEvent) {
  var requestUrl = new URL(fetchEvent.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (fetchEvent.request.method !== 'GET') {
    return;
  }

  fetchEvent.respondWith(
    caches.match(fetchEvent.request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(fetchEvent.request).then(function (networkResponse) {
        if (networkResponse && networkResponse.ok) {
          var responseClone = networkResponse.clone();
          caches.open(APP_SHELL_CACHE_NAME).then(function (cache) {
            cache.put(fetchEvent.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});
