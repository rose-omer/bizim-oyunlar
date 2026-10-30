import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  me, setName, currentRoom, setRoom, clearRoom, newRoomId, isValidRoomId,
  inviteUrl, lobbyUrl, gameUrl, isLocalMode, computeLocalMode,
  buildInviteUrl, buildLobbyUrl, buildGameUrl, parseGameParams, readGameParams, uuid,
} from '../js/core/identity.js';
import { SUPABASE_URL } from '../js/config.js';

const ROOT = 'https://kullanici.github.io/repo/';
const SITE = pathToFileURL(resolve(import.meta.dirname, '..')).href + '/';

test('newRoomId: 10 karakter, yalnız izinli alfabe, tekrar yok', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const id = newRoomId();
    assert.match(id, /^[abcdefghijkmnpqrstuvwxyz23456789]{10}$/);
    assert.doesNotMatch(id, /[lo01]/);
    assert.ok(isValidRoomId(id));
    seen.add(id);
  }
  assert.equal(seen.size, 500);
});

test('isValidRoomId: yalnız newRoomId biçimi', () => {
  assert.equal(isValidRoomId('abcdefghij'), true);
  assert.equal(isValidRoomId('abcdefghi'), false);
  assert.equal(isValidRoomId('abcdefghil'), false);
  assert.equal(isValidRoomId('ABCDEFGHIJ'), false);
  assert.equal(isValidRoomId(null), false);
});

test('uuid: v4 biçimi', () => {
  assert.match(uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('buildInviteUrl: sorgu hash\'ten önce, alt klasör korunur', () => {
  assert.equal(buildInviteUrl(ROOT, 'abcdefghij', false), 'https://kullanici.github.io/repo/#oda=abcdefghij');
  assert.equal(buildInviteUrl(ROOT, 'abcdefghij', true), 'https://kullanici.github.io/repo/?yerel=1#oda=abcdefghij');
});

test('buildLobbyUrl', () => {
  assert.equal(buildLobbyUrl(ROOT, false), ROOT);
  assert.equal(buildLobbyUrl(ROOT, true), ROOT + '?yerel=1');
});

test('buildGameUrl: oda, host, yerel; boş olanlar eklenmez', () => {
  assert.equal(buildGameUrl(ROOT, 'yapboz', {}, false), ROOT + 'games/yapboz/');
  assert.equal(
    buildGameUrl(ROOT, 'yapboz', { roomId: 'abcdefghij', host: 'h-1' }, false),
    ROOT + 'games/yapboz/?oda=abcdefghij&host=h-1',
  );
  assert.equal(
    buildGameUrl(ROOT, 'ciz', { roomId: 'abcdefghij' }, true),
    ROOT + 'games/ciz/?oda=abcdefghij&yerel=1',
  );
  assert.equal(buildGameUrl(ROOT, 'hafiza', undefined, true), ROOT + 'games/hafiza/?yerel=1');
});

test('parseGameParams: solo, ev sahibi, misafir, bozuk değer', () => {
  assert.deepEqual(parseGameParams('', 'me'), { roomId: null, hostId: null, isHost: true, solo: true });
  assert.deepEqual(parseGameParams('?oda=abcdefghij', 'me'),
    { roomId: 'abcdefghij', hostId: null, isHost: true, solo: false });
  assert.deepEqual(parseGameParams('?oda=abcdefghij&host=me', 'me'),
    { roomId: 'abcdefghij', hostId: 'me', isHost: true, solo: false });
  assert.deepEqual(parseGameParams('?oda=abcdefghij&host=sen&yerel=1', 'me'),
    { roomId: 'abcdefghij', hostId: 'sen', isHost: false, solo: false });
  assert.deepEqual(parseGameParams('?oda=<script>&host=', 'me'),
    { roomId: null, hostId: null, isHost: true, solo: true });
});

test('computeLocalMode', () => {
  assert.equal(computeLocalMode('', '', null), true);
  assert.equal(computeLocalMode('https://a.supabase.co', '', null), false);
  assert.equal(computeLocalMode('https://a.supabase.co', '?yerel=1', null), true);
  assert.equal(computeLocalMode('https://a.supabase.co', '?x=2&yerel=1', null), true);
  assert.equal(computeLocalMode('https://a.supabase.co', '?yerel=0', null), false);
  assert.equal(computeLocalMode('https://a.supabase.co', '', '1'), true);
});

test('URL\'ler site köküne göre; yerel modda yerel=1 taşır', () => {
  // Node'da location yok: yerel mod yalnız config boşsa.
  assert.equal(isLocalMode(), !SUPABASE_URL);
  const q = isLocalMode() ? '?yerel=1' : '';
  assert.equal(lobbyUrl(), SITE + q);
  assert.equal(inviteUrl('abcdefghij'), SITE + q + '#oda=abcdefghij');
  assert.equal(gameUrl('yapboz', { roomId: 'abcdefghij', host: 'x' }),
    SITE + 'games/yapboz/?oda=abcdefghij&host=x' + (q ? '&yerel=1' : ''));

  globalThis.location = { search: '?yerel=1' };
  try {
    assert.equal(isLocalMode(), true);
    assert.equal(lobbyUrl(), SITE + '?yerel=1');
    globalThis.location = { search: '' };
    assert.equal(isLocalMode(), true, 'sekme bayrağı sayfa geçişinde korunur');
  } finally {
    delete globalThis.location;
  }
});

test('me / setName / oda: kalıcı ve tutarlı', () => {
  const a = me();
  assert.match(a.clientId, /^[0-9a-f-]{36}$/);
  assert.equal(me().clientId, a.clientId);
  setName('  Ayşe  ');
  assert.equal(me().name, 'Ayşe');
  assert.equal(currentRoom(), null);
  setRoom('abcdefghij');
  assert.equal(currentRoom(), 'abcdefghij');
  clearRoom();
  assert.equal(currentRoom(), null);
});

test('readGameParams: location yokken solo', () => {
  assert.deepEqual(readGameParams(), { roomId: null, hostId: null, isHost: true, solo: true });
});
