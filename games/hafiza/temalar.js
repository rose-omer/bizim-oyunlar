// Hafıza Kartları emoji temaları. Her tema en az 18 farklı emoji (6×6 = 18 çift).
// Yalnız tek kod noktalı, eski cihazlarda da görünen emojiler.
export const THEMES = [
  {
    id: 'ask',
    name: 'Aşk',
    icon: '💖',
    emoji: ['💖', '💌', '💋', '💍', '🌹', '💐', '🍫', '🥂', '🧸', '🎁', '😍', '🥰', '😘', '💑', '🌷', '🍓', '🎀', '💒', '🦢', '🍰'],
  },
  {
    id: 'yemek',
    name: 'Yemek',
    icon: '🍕',
    emoji: ['🍕', '🍔', '🍟', '🌭', '🌮', '🍣', '🍜', '🍩', '🍪', '🍦', '🧁', '🍉', '🍇', '🍌', '🍒', '🥐', '🥨', '🧀', '🥑', '🍿'],
  },
  {
    id: 'hayvan',
    name: 'Hayvanlar',
    icon: '🐶',
    emoji: ['🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐧', '🐔', '🦄', '🐢', '🐙', '🦋'],
  },
  {
    id: 'seyahat',
    name: 'Seyahat',
    icon: '🧳',
    emoji: ['🚀', '🚗', '🚲', '🚂', '🚢', '⛵', '🚁', '🛵', '🗽', '🗼', '🏰', '🗻', '🎡', '🎢', '🧳', '🌋', '🚠', '🛶', '🌍', '⛺'],
  },
  {
    id: 'doga',
    name: 'Doğa',
    icon: '🌻',
    emoji: ['🌲', '🌵', '🌴', '🍀', '🍁', '🍄', '🌻', '🌼', '🌸', '🌈', '🌙', '⭐', '🌊', '🔥', '⛄', '🌞', '🌺', '🐞', '🌾', '🌰'],
  },
];

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || null;
}
