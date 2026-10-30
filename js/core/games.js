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
];

export function gameById(id) {
  return GAMES.find((g) => g.id === id) || null;
}
