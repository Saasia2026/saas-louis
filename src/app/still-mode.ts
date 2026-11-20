// Version « lien TikTok » : dans le navigateur intégré de TikTok, une vidéo
// qui démarre seule part en plein écran (iPhone) ou ne joue pas. Ce script,
// lancé en tête de page avant tout le reste, coupe donc toute lecture
// automatique : les vidéos gardent leur image fixe (poster). Seules celles
// que l'utilisateur lance avec le son (ses rendus) jouent encore.
// Marque <html data-still> pour le CSS. Pour voir cette version depuis un
// autre navigateur : ?tiktok=1 dans l'adresse (gardé pour la session).
export const STILL_MODE_SCRIPT = `(function(){
  var forced = /[?&]tiktok=1/.test(location.search);
  if (forced) try { sessionStorage.setItem("still", "1"); } catch (e) {}
  try { forced = forced || sessionStorage.getItem("still") === "1"; } catch (e) {}
  if (!forced && !/musical_ly|BytedanceWebview|TikTok/i.test(navigator.userAgent)) return;
  document.documentElement.setAttribute("data-still", "");
  var play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (this.muted) return Promise.resolve();
    return play.call(this);
  };
  function still(v) {
    v.autoplay = false;
    v.removeAttribute("autoplay");
    if (v.muted) v.preload = "none";
    if (v.muted && !v.paused) v.pause();
  }
  new MutationObserver(function (records) {
    records.forEach(function (r) {
      r.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.tagName === "VIDEO") still(n);
        else if (n.querySelectorAll) n.querySelectorAll("video").forEach(still);
      });
      if (r.type === "attributes" && r.target.tagName === "VIDEO") still(r.target);
    });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["autoplay"] });
})();`;
