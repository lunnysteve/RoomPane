'use strict';
// The controller requires the live Pi. Never cache admin responses or credentials.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{if(event.request.method==='GET')event.respondWith(fetch(event.request));});
