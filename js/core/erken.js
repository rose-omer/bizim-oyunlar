// İlk boyamadan önce çalışan klasik betik (her sayfanın <head>'inde, modül değil).
// 1) Tema: Ayarlar → localStorage 'bizim.tema'. Renk sıçraması olmasın; ui.js sonra da uygular.
// 2) Kilit perdesi: PIN varsa içerik, kilit.js kararını verene dek gizli kalır (kilit.js kaldırır).
(function () {
  var r = document.documentElement;
  try {
    var t = JSON.parse(localStorage.getItem('bizim.tema') || 'null') || {};
    r.dataset.renk = /^(pembe|mor|kirmizi|mercan|mavi)$/.test(t.renk) ? t.renk : 'pembe';
    r.dataset.mod = /^(otomatik|acik|koyu)$/.test(t.mod) ? t.mod : 'otomatik';
  } catch (e) { /* gizli sekme */ }
  try {
    if (localStorage.getItem('bizim.kilit')) {
      r.classList.add('kilit-bekle');
      // kilit.js yüklenemezse uygulama sonsuza dek gizli kalmasın.
      setTimeout(function () { r.classList.remove('kilit-bekle'); }, 4000);
    }
  } catch (e) { /* gizli sekme */ }
})();
