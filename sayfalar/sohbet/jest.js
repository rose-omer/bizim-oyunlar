// Mesaj balonu hareketleri: uzun basma (menü), çift dokunma (❤️), sağa kaydırma (yanıtla).
// Liste köküne tek kez bağlanır (olay yetkilendirme); satırlar yeniden çizilse de çalışır.

const UZUN_MS = 450;
const CIFT_MS = 300;
const KIPIR = 10;      // bu kadar oynarsa dokunma sayılmaz
const KAYDIR_ESIK = 60;
const KAYDIR_MAX = 84;

/**
 * kok: liste öğesi. Seçici: '.sh-satir[data-id] .sh-balon'.
 * on: { uzunBas(satir, { basili }), ciftDokun(satir, x, y), kaydir(satir), esik(), okIkonu() -> svg }
 */
export function jestleriBagla(kok, on) {
  let iz = null; // { id, x, y, satir, balon, zamanlayici, kaydiriyor, dx, uzun, ok }
  let sonDokunma = null; // { satir, t, x, y }
  let tikEngelle = 0;

  const satirBul = (hedef) => {
    const balon = hedef.closest?.('.sh-balon');
    if (!balon || !kok.contains(balon)) return null;
    const satir = balon.closest('.sh-satir[data-id]');
    return satir ? { satir, balon } : null;
  };

  const sifirla = (geriAl = true) => {
    if (!iz) return;
    clearTimeout(iz.zamanlayici);
    if (iz.kaydiriyor && geriAl) {
      const { satir } = iz;
      satir.classList.add('geri');
      satir.style.setProperty('--dx', '0px');
      satir.style.setProperty('--ok', '0');
      setTimeout(() => satir.classList.remove('geri', 'kaydiriliyor'), 220);
    }
    iz = null;
  };

  kok.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const b = satirBul(e.target);
    if (!b) return;
    sifirla(false);
    iz = { id: e.pointerId, x: e.clientX, y: e.clientY, ...b, kaydiriyor: false, dx: 0, uzun: false, tip: e.pointerType };
    iz.zamanlayici = setTimeout(() => {
      if (!iz || iz.kaydiriyor) return;
      iz.uzun = true;
      tikEngelle = Date.now();
      on.uzunBas?.(iz.satir, { basili: true });
    }, UZUN_MS);
  });

  kok.addEventListener('pointermove', (e) => {
    if (!iz || e.pointerId !== iz.id) return;
    const dx = e.clientX - iz.x;
    const dy = e.clientY - iz.y;
    if (!iz.kaydiriyor) {
      if (Math.abs(dx) > KIPIR || Math.abs(dy) > KIPIR) clearTimeout(iz.zamanlayici);
      // Yalnız dokunmatik/kalem; ekran kenarından başlayan (geri hareketi) değil.
      if (iz.tip !== 'mouse' && !iz.uzun && dx > 14 && Math.abs(dx) > Math.abs(dy) * 1.6 && iz.x > 24) {
        iz.kaydiriyor = true;
        try { iz.satir.setPointerCapture?.(e.pointerId); } catch { /* yok */ }
        iz.satir.classList.add('kaydiriliyor');
        if (!iz.satir.querySelector(':scope > .sh-ok')) {
          const ok = document.createElement('span');
          ok.className = 'sh-ok';
          ok.setAttribute('aria-hidden', 'true');
          const ic = on.okIkonu?.();
          if (ic) ok.append(ic);
          iz.satir.append(ok);
        }
        // Yanıt oku balonun hemen soluna konur.
        const sr = iz.satir.getBoundingClientRect();
        const br = iz.balon.getBoundingClientRect();
        iz.satir.style.setProperty('--ok-x', `${Math.max(6, br.left - sr.left - 40)}px`);
      } else {
        return;
      }
    }
    e.preventDefault();
    const yumusak = dx <= 0 ? 0 : dx < KAYDIR_ESIK ? dx : KAYDIR_ESIK + (dx - KAYDIR_ESIK) * 0.35;
    const x = Math.min(KAYDIR_MAX, yumusak);
    const gecti = dx >= KAYDIR_ESIK;
    if (gecti && !iz.gecti) on.esik?.();
    iz.gecti = gecti;
    iz.dx = dx;
    iz.satir.style.setProperty('--dx', `${x}px`);
    iz.satir.style.setProperty('--ok', String(Math.min(1, x / KAYDIR_ESIK)));
  }, { passive: false });

  const bitir = (e) => {
    if (!iz || e.pointerId !== iz.id) return;
    clearTimeout(iz.zamanlayici);
    if (iz.kaydiriyor) {
      tikEngelle = Date.now();
      const satir = iz.satir;
      const yeter = iz.dx >= KAYDIR_ESIK;
      sifirla(true);
      if (yeter) on.kaydir?.(satir);
      return;
    }
    if (iz.uzun) { sifirla(false); return; }
    const kipir = Math.hypot(e.clientX - iz.x, e.clientY - iz.y) > KIPIR;
    if (!kipir && e.type === 'pointerup') {
      const simdi = Date.now();
      if (sonDokunma && sonDokunma.satir === iz.satir && simdi - sonDokunma.t < CIFT_MS) {
        sonDokunma = null;
        tikEngelle = simdi;
        window.getSelection?.()?.removeAllRanges?.();
        on.ciftDokun?.(iz.satir, e.clientX, e.clientY);
      } else {
        sonDokunma = { satir: iz.satir, t: simdi };
      }
    }
    sifirla(false);
  };
  kok.addEventListener('pointerup', bitir);
  kok.addEventListener('pointercancel', (e) => { if (iz && e.pointerId === iz.id) sifirla(true); });

  // Uzun basma / kaydırma / çift dokunmadan hemen sonra gelen tıklama yutulur.
  kok.addEventListener('click', (e) => {
    if (Date.now() - tikEngelle < 400) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // Sağ tık (masaüstü) ve Android uzun basma: menü.
  kok.addEventListener('contextmenu', (e) => {
    const b = satirBul(e.target);
    if (!b) return;
    e.preventDefault();
    if (Date.now() - tikEngelle < 700) return; // uzun basma zaten açtı
    tikEngelle = Date.now();
    const basili = !!iz && iz.tip !== 'mouse'; // dokunmatik uzun basmada parmak hâlâ ekranda
    sifirla(false);
    on.uzunBas?.(b.satir, { basili });
  });
}

export { CIFT_MS };
