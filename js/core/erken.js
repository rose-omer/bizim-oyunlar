// İlk boyamadan önce çalışan klasik betik (her sayfanın <head>'inde, modül değil).
// 1) Tema: Ayarlar → localStorage 'bizim.tema'. Renk sıçraması olmasın; ui.js sonra da uygular.
// 2) Kilit perdesi: PIN varsa içerik, kilit.js kararını verene dek gizli kalır (kilit.js kaldırır).
//    Kendiliğinden kalkmaz (fail-closed). 8 sn sonra hâlâ duruyorsa "Kilit yüklenemedi" kartı çıkar.
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
      // base.css yüklenemese de perde tutsun.
      var st = document.createElement('style');
      st.textContent = 'html.kilit-bekle body{visibility:hidden}';
      document.head.appendChild(st);
      setTimeout(yuklenemedi, 8000);
    }
  } catch (e) { /* gizli sekme */ }

  // Perde body'yi gizler; kart kendi visibility:visible stiliyle görünür. kilit.js geç gelirse kaldırır.
  function yuklenemedi() {
    if (!r.classList.contains('kilit-bekle') || !document.body || document.getElementById('kilit-yuklenemedi')) return;
    var kart = document.createElement('div');
    kart.id = 'kilit-yuklenemedi';
    kart.setAttribute('role', 'alert');
    kart.style.cssText = 'visibility:visible;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2001;'
      + 'box-sizing:border-box;width:calc(100% - 32px);max-width:320px;padding:24px 20px;border-radius:22px;'
      + 'display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;'
      + 'background:var(--surface,#fff);color:var(--text,#3B1F2B);border:1px solid var(--line,#EADAD1);'
      + 'box-shadow:0 24px 48px -20px rgb(94 43 79 / .4);font:600 1rem/1.5 Quicksand,ui-rounded,"Segoe UI",system-ui,sans-serif';
    var metin = document.createElement('p');
    metin.style.margin = '0';
    metin.textContent = 'Kilit yüklenemedi.';
    var dugme = document.createElement('button');
    dugme.type = 'button';
    dugme.textContent = 'Yeniden dene';
    dugme.style.cssText = 'min-height:48px;padding:0 24px;border:0;border-radius:999px;cursor:pointer;font:inherit;font-weight:750;'
      + 'background:var(--accent,#C2375C);color:var(--accent-ink,#fff)';
    dugme.onclick = function () { location.reload(); };
    kart.appendChild(metin);
    kart.appendChild(dugme);
    document.body.appendChild(kart);
    dugme.focus();
  }
})();
