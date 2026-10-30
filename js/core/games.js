// Oyun kaydı: ana sayfa kartları ve oyun başlıkları buradan okunur.
export const GAMES = [
  {
    id: 'yapboz',
    title: 'Yapboz',
    emoji: '🧩',
    desc: 'Bir fotoğrafınızı 100–1000 parçaya bölün, aynı anda birlikte tamamlayın.',
    players: '1–2',
    minutes: '15–90 dk',
  },
  {
    id: 'tanis',
    title: 'Beni Ne Kadar Tanıyorsun?',
    emoji: '💭',
    desc: 'Biri kendini cevaplar, diğeri tahmin eder. Sırayla, puanlı.',
    players: '2',
    minutes: '10 dk',
  },
  {
    id: 'aynikafa',
    title: 'Aynı Kafa',
    emoji: '🤝',
    desc: '"Bu mu, o mu?" İkiniz aynı anda seçin, uyumunuzu görün.',
    players: '2',
    minutes: '5 dk',
  },
  {
    id: 'dogruluk',
    title: 'Doğruluk mu Cesaret mi',
    emoji: '🎲',
    desc: 'Sırayla kart çekin: tatlı, eğlenceli ya da cesur.',
    players: '2',
    minutes: '10–30 dk',
  },
  {
    id: 'hafiza',
    title: 'Hafıza Kartları',
    emoji: '🃏',
    desc: 'Sırayla kart çevirin, eşleri bulun. Kim daha çok bulacak?',
    players: '1–2',
    minutes: '5–10 dk',
  },
  {
    id: 'ciz',
    title: 'Çiz Bakalım',
    emoji: '🎨',
    desc: 'Ortak tuvalde birlikte çizin ya da biri çizsin, diğeri tahmin etsin.',
    players: '1–2',
    minutes: '10 dk',
  },
  {
    id: 'kimdaha',
    title: 'Kim Daha Çok?',
    emoji: '🤔',
    desc: '"Kim daha çok uyur?" İkiniz de "ben" ya da "sen" deyin, aynı düşünüyor musunuz görün.',
    players: '2',
    minutes: '5–10 dk',
  },
  {
    id: 'hicyaptin',
    title: 'Hiç … Yaptın mı?',
    emoji: '🙈',
    desc: 'İkiniz de cevaplayın, cevaplar aynı anda açılsın. Sürprizlere hazır olun.',
    players: '2',
    minutes: '5–15 dk',
  },
  {
    id: 'derin',
    title: 'Derin Sohbet',
    emoji: '🕯️',
    desc: 'Üç aşamada gittikçe derinleşen sorular. Acele yok, sırayla anlatın.',
    players: '2',
    minutes: '20–45 dk',
  },
  {
    id: 'dama',
    title: 'Dama',
    emoji: '⚫',
    desc: 'Klasik Türk daması. Sırayla oynayın, istediğiniz zaman kaldığınız yerden devam edin.',
    players: '2',
    minutes: '15–40 dk',
  },
  {
    id: 'tavla',
    title: 'Tavla',
    emoji: '🎯',
    desc: 'Zarları atın, pulları toplayın. Mars olmamaya bakın.',
    players: '2',
    minutes: '10–30 dk',
  },
  {
    id: 'dorttas',
    title: 'Dört Taş',
    emoji: '🔴',
    desc: 'Taşları sırayla bırakın, dördü yan yana gelen kazanır. İçinde XOX da var.',
    players: '2',
    minutes: '3–10 dk',
  },
  {
    id: 'amiral',
    title: 'Amiral Battı',
    emoji: '🚢',
    desc: 'Gemilerinizi gizlice yerleştirin, sırayla atış yapın. İlk batıran kazanır.',
    players: '2',
    minutes: '10–20 dk',
  },
];

export function gameById(id) {
  return GAMES.find((g) => g.id === id) || null;
}

// Uygulama sayfaları (oyun değil). path site köküne göre; ns = presence sayfa adı = id.
export const SAYFALAR = [
  { id: 'biz', title: 'Biz', icon: '💞', path: '', desc: 'Ana sayfa: kaç gündür birlikteyiz, bugün, oyunlar.' },
  { id: 'sohbet', title: 'Sohbet', icon: '💬', path: 'sayfalar/sohbet/', desc: 'Yalnız ikinizin mesajlaşma yeri.' },
  { id: 'anilar', title: 'Anılarımız', icon: '📸', path: 'sayfalar/anilar/', desc: 'Fotoğraflı anı zaman çizelgesi ve albüm.' },
  { id: 'gunler', title: 'Özel Günler', icon: '📅', path: 'sayfalar/gunler/', desc: 'Yıl dönümleri, doğum günleri, takvim ve geri sayım.' },
  { id: 'mektup', title: 'Mektuplar', icon: '💌', path: 'sayfalar/mektup/', desc: 'Aşk mektupları ve zamanı gelince açılan kapsüller.' },
  { id: 'listeler', title: 'Listelerimiz', icon: '📝', path: 'sayfalar/listeler/', desc: 'Birlikte yapılacaklar, izlenecekler, gidilecek yerler.' },
  { id: 'gunsorusu', title: 'Günün Sorusu', icon: '❓', path: 'sayfalar/gunun-sorusu/', desc: 'Her gün bir soru; ikiniz de cevaplayınca açılır.' },
  { id: 'sevgidili', title: 'Sevgi Dili Testi', icon: '💗', path: 'sayfalar/sevgi-dili/', desc: 'Sevgiyi nasıl gösterip nasıl hissediyorsunuz?' },
  { id: 'randevu', title: 'Randevu Fikirleri', icon: '🌹', path: 'sayfalar/randevu/', desc: 'Evde, dışarıda ya da uzaktan: ne yapsak?' },
  { id: 'izle', title: 'Birlikte İzle', icon: '🎬', path: 'sayfalar/izle/', desc: 'Aynı YouTube videosunu aynı anda izleyin.' },
  { id: 'ayarlar', title: 'Ayarlar', icon: '⚙️', path: 'sayfalar/ayarlar/', desc: 'Profil, başlangıç tarihi, bildirim, kilit, tema.' },
  { id: 'daha', title: 'Daha', icon: '☰', path: 'sayfalar/daha/', desc: 'Tüm özellikler.' },
  { id: 'ruh', title: 'Ruh Hâlimiz', icon: '🌤️', path: 'sayfalar/ruh/', desc: 'İkinizin ruh hâli geçmişi: son 30 ve 90 gün, haftalık özet.' },
  { id: 'skor', title: 'Skor Tablosu', icon: '🏆', path: 'sayfalar/skor/', desc: 'Kim kaç kez kazandı? Oyun oyun skorunuz.' },
  { id: 'yilimiz', title: 'Yılımız', icon: '✨', path: 'sayfalar/yilimiz/', desc: 'Bir yılınızın hikâyesi: mesajlar, anılar, oyunlar.' },
  { id: 'rozetler', title: 'Rozetlerimiz', icon: '🏅', path: 'sayfalar/rozetler/', desc: 'Birlikte açtığınız rozetler ve sıradakiler.' },
];

// Alt sekme çubuğu sırası.
export const SEKMELER = ['biz', 'sohbet', 'anilar', 'gunler', 'daha'];

export function sayfaById(id) {
  return SAYFALAR.find((s) => s.id === id) || null;
}
