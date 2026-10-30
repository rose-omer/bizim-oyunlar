import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDay, toDay, daysBetween, addDays, daysTogether, durationParts, nextOccurrence,
  occurrenceIndex, upcoming, milestones, todaysEvents, countdown, leftText,
} from '../js/core/gunler.js';

test('parseDay geçersiz tarihleri reddeder', () => {
  assert.deepEqual(parseDay('2024-02-29'), { y: 2024, m: 2, d: 29 });
  assert.equal(parseDay('2023-02-29'), null);
  assert.equal(parseDay('2024-13-01'), null);
  assert.equal(parseDay('dün'), null);
  assert.equal(toDay(new Date(2026, 0, 5)), '2026-01-05');
});

test('gün farkı yaz saatinden etkilenmez', () => {
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2023-12-31', 1), '2024-01-01');
});

test('daysTogether: başlangıç günü 1. gün; gelecek 0', () => {
  assert.equal(daysTogether('2026-10-30', '2026-10-30'), 1);
  assert.equal(daysTogether('2026-10-01', '2026-10-30'), 30);
  assert.equal(daysTogether('2026-11-01', '2026-10-30'), 0);
  assert.equal(daysTogether('yok', '2026-10-30'), 0);
});

test('durationParts', () => {
  assert.deepEqual(durationParts('2024-01-31', '2026-03-01'), { years: 2, months: 1, days: 1 });
  assert.deepEqual(durationParts('2025-10-30', '2026-10-30'), { years: 1, months: 0, days: 0 });
});

test('nextOccurrence: yıllık, aylık, tek seferlik, 29 Şubat ve ay sonu', () => {
  assert.equal(nextOccurrence('2020-11-05', 'yil', '2026-10-30'), '2026-11-05');
  assert.equal(nextOccurrence('2020-10-30', 'yil', '2026-10-30'), '2026-10-30');
  assert.equal(nextOccurrence('2020-03-01', 'yil', '2026-10-30'), '2027-03-01');
  assert.equal(nextOccurrence('2020-02-29', 'yil', '2026-01-01'), '2026-02-28');
  assert.equal(nextOccurrence('2026-01-31', 'ay', '2026-02-10'), '2026-02-28');
  assert.equal(nextOccurrence('2026-01-15', 'ay', '2026-12-20'), '2027-01-15');
  assert.equal(nextOccurrence('2026-12-01', 'yok', '2026-10-30'), '2026-12-01');
  assert.equal(nextOccurrence('2026-01-01', 'yok', '2026-10-30'), null);
  assert.equal(occurrenceIndex('2020-11-05', 'yil', '2026-11-05'), 6);
  assert.equal(occurrenceIndex('2026-01-31', 'ay', '2026-02-28'), 1);
});

test('upcoming: en yakın önce, kaçıncı ve sınır', () => {
  const gunler = [
    { id: 'a', data: { baslik: 'Sevgilimin doğum günü', tarih: '2000-11-05', tekrar: 'yil', tur: 'dogumgunu' } },
    { id: 'b', data: { baslik: 'İlk öpücük', tarih: '2024-10-30', tekrar: 'yil' } },
    { id: 'c', data: { baslik: 'Konser', tarih: '2026-01-01', tekrar: 'yok' } },
  ];
  const u = upcoming(gunler, { today: '2026-10-30' });
  assert.deepEqual(u.map((x) => x.id), ['b', 'a']);
  assert.equal(u[0].daysLeft, 0);
  assert.equal(u[0].kacinci, 2);
  assert.equal(u[1].kacinci, 26);
  assert.equal(upcoming(gunler, { today: '2026-10-30', within: 0 }).length, 1);
});

test('milestones: 100. gün ve yıl dönümü', () => {
  const m = milestones('2026-08-01', { today: '2026-10-30', limit: 3 });
  assert.equal(m[0].baslik, '100. günümüz');
  assert.equal(m[0].date, '2026-11-08');
  assert.equal(m[0].daysLeft, 9);
  const y = milestones('2025-10-30', { today: '2026-10-30', limit: 1 });
  assert.deepEqual([y[0].baslik, y[0].daysLeft], ['1. yıl dönümümüz', 0]);
  const ay = milestones('2026-09-15', { today: '2026-10-30', limit: 10, monthly: true });
  assert.ok(ay.some((x) => x.tur === 'ay' && x.date === '2026-11-15' && x.n === 2));
});

test('todaysEvents ve countdown', () => {
  const ev = todaysEvents([{ id: 'b', data: { baslik: 'X', tarih: '2024-10-30' } }], '2025-10-30', '2026-10-30');
  assert.deepEqual(ev.map((e) => e.baslik), ['1. yıl dönümümüz', 'X']);
  const c = countdown('2026-10-31T12:30:15Z', new Date('2026-10-30T10:00:00Z'));
  assert.deepEqual([c.past, c.days, c.hours, c.minutes, c.seconds], [false, 1, 2, 30, 15]);
  assert.equal(countdown('x'), null);
  assert.equal(leftText(0), 'Bugün');
  assert.equal(leftText(1), 'Yarın');
  assert.equal(leftText(5), '5 gün kaldı');
});
