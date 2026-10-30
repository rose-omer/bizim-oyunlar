// Uygulama sayfalarının ortak açılışı (sayfalar/<ad>/app.js).
// Oda yoksa ana sayfaya döner. Odaya katılır, üst şeridi ve alt sekme çubuğunu kurar.
import { currentRoom, lobbyUrl } from './identity.js';
import { joinRoom } from './room.js';
import { mountShell, mountTabBar } from './ui.js';

/** -> { room, roomId, me }. ns = sayfa id'si (SAYFALAR), tab = alt çubukta seçili sekme (yoksa null). */
export async function bootPage({ ns, title, tab = null }) {
  const roomId = currentRoom();
  if (!roomId) {
    location.replace(lobbyUrl());
    return new Promise(() => {}); // yönlendirme sürerken sayfa devam etmesin
  }
  const room = await joinRoom({ roomId, ns });
  mountShell({ title, room });
  mountTabBar(tab);
  return { room, roomId, me: room.me };
}
