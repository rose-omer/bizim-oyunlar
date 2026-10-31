// Takvime ekle (özel gün penceresi) ve Tümünü takvime aktar (sayfa sonu, ikincil): arayüz ve dosya paylaşımı.
// .ics metni ./ics.js'ten (saf) gelir. app.js'e yalnız `// ics:` kancalarıyla bağlanır.
import { h, toast } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { isNative } from '../../js/core/mobil.js';
import { parseDay, toDay } from '../../js/core/gunler.js';
import { ICS_DOSYA, ICS_TUR, gunOlayi, icsOlaylari, icsMetni } from './ics.js';

const TAKVIM_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
  + '<rect x="4" y="5.5" width="16" height="14.5" rx="2.8"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M12 12.6v4.8M9.6 15h4.8"/></svg>';

function takvimSimgesi() {
  const t = document.createElement('template');
  t.innerHTML = TAKVIM_SVG;
  return t.content.firstElementChild;
}

// ---------- Paylaşım ----------

function tarayiciOrtami() {
  return {
    nav: globalThis.navigator,
    doc: globalThis.document,
    yerel: isNative(),
    eklenti: (ad) => globalThis.Capacitor?.Plugins?.[ad] || null,
    zamanla: (fn, ms) => setTimeout(fn, ms),
  };
}

// Tarayıcı: AbortError. Capacitor Share eklentisi: "Share canceled".
const iptalMi = (e) => e?.name === 'AbortError' || /cancel/i.test(e?.message || '');

/**
 * .ics dosyasını paylaşır ya da indirir. Sıra:
 * 1. Web Share dosya kabul ediyorsa paylaş (Android Chrome .ics'i kabul etmez; indirmeye düşer).
 * 2. Uygulamada (Capacitor) WebView indirmesi çalışmaz: Filesystem + Share eklentisi varsa dosyayı paylaş, yoksa 'yok'.
 * 3. Tarayıcıda <a download>.
 * -> 'paylasildi' | 'iptal' | 'indirildi' | 'yok' | 'hata'. Hata fırlatmaz.
 */
export async function icsPaylas(metin, o = tarayiciOrtami()) {
  try {
    const dosya = typeof File === 'function' ? new File([metin], ICS_DOSYA, { type: ICS_TUR }) : null;
    if (dosya && o.nav?.canShare?.({ files: [dosya] })) {
      try {
        await o.nav.share({ files: [dosya], title: 'Biz İkimiz' });
        return 'paylasildi';
      } catch (e) {
        if (iptalMi(e)) return 'iptal';
        // İzin ya da tür hatası: aşağıdaki yollara düş.
      }
    }
    if (o.yerel) {
      const fs = o.eklenti('Filesystem');
      const share = o.eklenti('Share');
      if (typeof fs?.writeFile !== 'function' || typeof share?.share !== 'function') return 'yok';
      const { uri } = await fs.writeFile({ path: ICS_DOSYA, data: metin, directory: 'CACHE', encoding: 'utf8' });
      await share.share({ title: 'Biz İkimiz', files: [uri], dialogTitle: 'Takvime ekle' });
      return 'paylasildi';
    }
    const url = URL.createObjectURL(new Blob([metin], { type: ICS_TUR }));
    const a = o.doc.createElement('a');
    a.href = url;
    a.download = ICS_DOSYA;
    a.hidden = true;
    o.doc.body.append(a);
    a.click();
    a.remove();
    o.zamanla(() => URL.revokeObjectURL(url), 30000);
    return 'indirildi';
  } catch (e) {
    if (iptalMi(e)) return 'iptal';
    console.warn('[takvim] paylaşım', e);
    return 'hata';
  }
}

const SONUC_YAZI = {
  paylasildi: 'Takvim dosyası paylaşıldı 📅',
  indirildi: 'biz-ikimiz.ics indirildi. Açınca takvimine eklenir.',
  yok: 'Bu özellik tarayıcıdan açınca çalışır.',
  hata: 'Takvim dosyası hazırlanamadı.',
};

function sonucYaz(sonuc) {
  if (!SONUC_YAZI[sonuc]) return; // iptal: sessiz
  if (sonuc === 'paylasildi' || sonuc === 'indirildi') sfx('pop');
  toast(SONUC_YAZI[sonuc], { ms: sonuc === 'paylasildi' ? undefined : 5000 });
}

/** Düğme çalışırken kilitli (çift dokunuş iki dosya açmasın). */
async function kilitle(btn, is) {
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try {
    return await is();
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

// ---------- Özel gün penceresi: "Takvime ekle" ----------

/** Özel gün penceresinin gövdesine eklenir. belge(): kayıtlı güncel belge (kaydedilmemiş form değil). */
export function takvimeEkleAlani(belge) {
  const btn = h('button', { type: 'button', class: 'btn' }, takvimSimgesi(), 'Takvime ekle');
  btn.addEventListener('click', () => kilitle(btn, async () => {
    const o = gunOlayi(belge());
    if (!o) { toast('Önce geçerli bir tarih kaydet.'); return; }
    sonucYaz(await icsPaylas(icsMetni([o], { simdi: new Date() })));
  }));
  return h('div', { class: 'gn-field gn-ics-ekle' }, btn);
}

// ---------- Sayfa sonu: "Tümünü takvime aktar" ----------

let pencereNo = 0;

function aktarPenceresi(veri) {
  const id = `gn-ics-${++pencereNo}`;
  const tasVar = !!parseDay(veri().baslangic);
  const kutu = h('input', { type: 'checkbox', id: `${id}-tas` });
  const sayi = h('p', { class: 'gn-ics-sayi', id: `${id}-sayi`, 'aria-live': 'polite' });
  const aktar = h('button', { type: 'button', class: 'btn primary', 'aria-describedby': `${id}-sayi` }, takvimSimgesi(), 'Aktar');
  const dlg = h('dialog', { class: 'ui-dialog sheet gn-ics-dlg', 'aria-labelledby': id });
  const kapat = () => { if (dlg.open) dlg.close(); };
  const olaylar = () => icsOlaylari({ ...veri(), taslar: kutu.checked, bugun: toDay(), simdi: new Date() });
  const say = () => {
    const n = olaylar().length;
    sayi.textContent = n ? `${n} etkinlik aktarılacak.` : 'Henüz aktarılacak bir gün yok. Önce bir özel gün ekleyelim mi?';
    aktar.disabled = !n;
  };
  kutu.addEventListener('change', () => { sfx('tap'); say(); });
  aktar.addEventListener('click', () => kilitle(aktar, async () => {
    const l = olaylar();
    if (!l.length) return;
    const sonuc = await icsPaylas(icsMetni(l, { simdi: new Date() }));
    if (sonuc !== 'iptal') kapat();
    sonucYaz(sonuc);
  }).then(say));

  dlg.append(h('div', { class: 'dialog-card gn-ics-card' },
    h('h2', { class: 'gn-ics-h', id }, 'Takvime aktar'),
    h('p', { class: 'gn-hint' }, 'Özel günler, doğum günleri ve planlı buluşma tek dosyada; hatırlatmalarıyla birlikte.'),
    tasVar ? h('label', { class: 'gn-ics-opt' }, kutu,
      h('span', {}, 'Kilometre taşlarını da ekle', h('small', {}, '100. gün, 1000. gün, yıl dönümleri · 10 yıl'))) : null,
    sayi,
    h('p', { class: 'gn-hint gn-ics-not' }, 'Dosyayı açınca takvimin eklemeyi sorar. Açmazsa calendar.google.com › Ayarlar › İçe aktar.'),
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: kapat }, 'Vazgeç'),
      aktar)));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) kapat(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  say();
  dlg.showModal();
}

/** Sayfanın sonuna, ikincil eylem olarak konur. veri(): { gunler, kisiler, baslangic, cift } (açılışta ve aktarırken okunur). */
export function takvimeAktarCubugu(veri) {
  return h('div', { class: 'gn-ics-bar' },
    h('button', { type: 'button', class: 'btn ghost', onclick: () => { sfx('tap'); aktarPenceresi(veri); } },
      takvimSimgesi(), 'Tümünü takvime aktar'),
    h('p', { class: 'gn-hint' }, 'Özel günleriniz telefonunun takviminde de görünsün.'));
}
