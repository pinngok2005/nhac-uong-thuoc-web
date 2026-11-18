self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let data = { title: "Nhắc uống thuốc", body: "Đến giờ uống thuốc rồi!" };
  try { if (event.data) data = event.data.json(); } catch (e) { data.body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(data.title || "Nhắc uống thuốc", {
    body: data.body || "Đến giờ uống thuốc rồi!",
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    sound: "default"
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
