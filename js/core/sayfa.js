// Uygulama sayfalarının ortak açılışı (sayfalar/<ad>/app.js).
// Oda yoksa ana sayfaya döner. PIN kilidi kararını bekler, cihaz onayını (üyelik kapısı) bekler, odaya katılır,
// üst şeridi ve alt sekme çubuğunu kurar.
import { currentRoom, lobbyUrl, readStore } from './identity.js';
import { joinRoom } from './room.js';
import { mountShell, mountTabBar } from './ui.js';
import { kapidanGec } from './kapi.js';

/** -> { room, roomId, me }. ns = sayfa id'si (SAYFALAR), tab = alt çubukta seçili sekme (yoksa null). */
export async function bootPage({ ns, title, tab = null }) {
  const roomId = currentRoom();
  if (!roomId) {
    location.replace(lobbyUrl());
    return new Promise(() => {}); // yönlendirme sürerken sayfa devam etmesin
  }
  // Kilit kararı odaya katılmadan (veri yüklenmeden) önce. PIN yoksa hemen döner.
  try {
    await (await import('./kilit.js')).kilitKontrol();
  } catch (e) {
    console.warn('[kilit]', e);
    // PIN varsa sayfa açılmaz: erken.js perdesi kalır, 8 sn sonra "Yeniden dene" kartı çıkar.
    if (readStore('local', 'bizim.kilit')) return new Promise(() => {});
  }
  // Üyelik kapısı: bu cihaz onaylı değilse "Onay bekleniyor" ekranı açılır; sayfa verisi yüklenmez.
  await kapidanGec(roomId);
  const room = await joinRoom({ roomId, ns });
  mountShell({ title, room });
  mountTabBar(tab);
  return { room, roomId, me: room.me };
}
