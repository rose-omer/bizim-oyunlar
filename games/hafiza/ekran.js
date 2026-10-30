// DOM yardımcıları (Hafıza ve Çiz ortak). Testler bunu içe aktarmaz.

// Kök öğeyi görünür alanın kalanına sığdırır; sayfa kaymaz. Klavye açılınca da küçülür.
export function fitToViewport(el, onChange) {
  let raf = 0;
  const update = () => {
    raf = 0;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const top = Math.max(0, el.getBoundingClientRect().top);
    let h = Math.max(240, Math.floor(vh - top));
    el.style.height = `${h}px`;
    // #app'in alt dolgusu taşırırsa bir kez düzelt
    const over = document.documentElement.scrollHeight - window.innerHeight;
    if (over > 0 && over < 120) {
      h = Math.max(240, h - over);
      el.style.height = `${h}px`;
    }
    onChange?.();
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  update();
  return schedule;
}

export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
