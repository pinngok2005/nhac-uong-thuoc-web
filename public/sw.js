self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let data = { title: "Nhắc uống thuốc", body: "Đến giờ uống thuốc rồi!" };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title || "Nhắc uống thuốc", {
    body: data.body || "Đến giờ uống thuốc rồi!"
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
