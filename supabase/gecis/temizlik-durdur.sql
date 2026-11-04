-- Zamanlamayı durdurur. Daha önce silinen veri geri gelmez.
select cron.unschedule('biz-cop-temizle');
select cron.unschedule('biz-medya-temizle');
