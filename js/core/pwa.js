// Uygulama olarak kurulum (PWA). Sahip: Sunucu ajanı. Şimdilik yer tutucu.
/** Service worker kaydı. Her sayfada mountShell çağırır; tekrar çağrılması zararsız. */
export function registerPwa() {}
/** -> { durum: 'kurulu' | 'kurulabilir' | 'ios-elle' | 'yok', kur(): Promise<boolean> } */
export function kurulumDurumu() { return { durum: 'yok', kur: async () => false }; }
