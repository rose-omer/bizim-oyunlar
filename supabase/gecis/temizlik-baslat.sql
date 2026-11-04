-- Çöp temizliğini ve dosya silme kuyruğunu zamanlar. İLK ÇALIŞMA GERİ ALINAMAZ: 30 günden eski çöp kalıcı silinir
-- (on-kontrol.sql 7. sorgu). Durdurma: temizlik-durdur.sql. Saatler UTC.
select cron.schedule('biz-cop-temizle', '30 0 * * *', $cron$select public.cop_temizle()$cron$);
select cron.schedule('biz-medya-temizle', '15 * * * *', $cron$select public.medya_temizle_cagir()$cron$);
