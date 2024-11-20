// service-worker.js

const CACHE_NAME = 'defect-manager-v2'; // Increment version
const APP_CACHE = 'app-cache-v2';
const API_CACHE = 'api-cache-v2';

// Assets that need to be available offline
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/css/main.css',
  '/static/js/main.js',
  '/favicon.ico',
  '/manifest.json'
];

// API endpoints that should be cached differently
const API_ENDPOINTS = [
  '/rest/v1/defects',
  '/rest/v1/user_vessels'
];

// Check if a request is an API call
const isApiRequest = (url) => {
  return API_ENDPOINTS.some(endpoint => url.includes(endpoint));
};

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(APP_CACHE).then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Create API cache
      caches.open(API_CACHE).then(cache => {
        console.log('Initializing API cache');
      })
    ])
    .then(() => {
      console.log('Service worker installed');
      return self.skipWaiting();
    })
    .catch(error => {
      console.error('Installation failed:', error);
    })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (![APP_CACHE, API_CACHE].includes(cacheName)) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Clear old API cache entries
      caches.open(API_CACHE).then(cache => {
        return cache.keys().then(requests => {
          return Promise.all(
            requests.map(request => cache.delete(request))
          );
        });
      })
    ])
    .then(() => {
      console.log('Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Handle API requests
  if (isApiRequest(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone the response
          const responseToCache = response.clone();
          
          // Cache the fresh data
          caches.open(API_CACHE)
            .then(cache => {
              cache.put(event.request, responseToCache);
            })
            .catch(error => {
              console.error('API cache failed:', error);
            });

          return response;
        })
        .catch(error => {
          // If offline, try to return cached data
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              throw error;
            });
        })
    );
    return;
  }

  // Handle static assets
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached response if available
        if (cachedResponse) {
          // Fetch new version in background
          fetch(event.request)
            .then(response => {
              caches.open(APP_CACHE)
                .then(cache => {
                  cache.put(event.request, response);
                });
            })
            .catch(() => {/* ignore */});
          
          return cachedResponse;
        }

        // If not in cache, fetch from network
        return fetch(event.request)
          .then(response => {
            // Cache valid responses
            if (response.ok) {
              const responseToCache = response.clone();
              caches.open(APP_CACHE)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            return response;
          });
      })
      .catch(error => {
        console.error('Fetch failed:', error);
        // Return offline page if available
        return caches.match('/offline.html');
      })
  );
});

// Handle updates
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Periodic cache cleanup
setInterval(() => {
  caches.open(API_CACHE).then(cache => {
    cache.keys().then(requests => {
      requests.forEach(request => {
        // Delete cached API responses older than 1 hour
        cache.match(request).then(response => {
          if (response) {
            const cachedAt = response.headers.get('cached-at');
            if (cachedAt && Date.now() - new Date(cachedAt).getTime() > 3600000) {
              cache.delete(request);
            }
          }
        });
      });
    });
  });
}, 3600000); // Run every hour
