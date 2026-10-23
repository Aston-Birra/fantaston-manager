
/* FANTASTON - REGISTRAZIONE PWA */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((registration) => {
        console.log(
          "[FANTASTON] Service Worker registrato:",
          registration.scope
        );
      })
      .catch((error) => {
        console.error(
          "[FANTASTON] Errore Service Worker:",
          error
        );
      });
  });
}
