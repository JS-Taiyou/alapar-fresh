self.addEventListener("load", function () {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").then(function () {
    if (caches && caches.keys) {
      caches.keys().then(function (names) {
        const kept = [
          "alapar-v1",
          "alapar-build-v1",
          "alapar-api-v1",
          "alapar-html-v1",
        ];
        names.forEach(function (n) {
          if (kept.indexOf(n) === -1) caches.delete(n);
        });
      });
    }
  });
});
