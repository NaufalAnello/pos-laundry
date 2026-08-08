// Test koreksi saldo deposit:
//   1. Login as owner, koreksi saldo pelanggan dari 30.000 → 50.000
//      → Verifikasi saldo langsung jadi 50.000 (BUKAN 80.000 dari selisih)
//   2. Verifikasi mutasi tercatat jenis=koreksi, nominal=+20.000
//   3. Buat user karyawan, login → koreksi ditolak 403
//
// Usage: node scripts/test_koreksi_deposit.js

const knex = require('knex')(require('../knexfile').development);
const bcrypt = require('bcryptjs');
const BASE = 'http://localhost:3000';

function fetchWithCookie(url, opts = {}, jar) {
  const headers = { ...(opts.headers || {}) };
  if (jar.cookie) headers['Cookie'] = jar.cookie;
  return fetch(url, { ...opts, headers, redirect: 'manual' }).then(async (r) => {
    const setCookie = r.headers.get('set-cookie');
    if (setCookie) jar.cookie = setCookie.split(';')[0];
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, body };
  });
}

(async () => {
  // ── Setup: test customer + karyawan user
  const TEL = '628999000333';
  const oldPel = await knex('pelanggan').where({ telepon: TEL }).first();
  if (oldPel) {
    await knex('mutasi_deposit').where({ pelanggan_id: oldPel.id }).del();
    await knex('deposit_pelanggan').where({ pelanggan_id: oldPel.id }).del();
    await knex('pelanggan').where({ id: oldPel.id }).del();
  }
  const [pelId] = await knex('pelanggan').insert({
    nama: 'Test Koreksi', telepon: TEL, created_at: new Date(), updated_at: new Date()
  });
  await knex('deposit_pelanggan').insert({
    pelanggan_id: pelId, saldo: 30000, updated_at: new Date()
  });

  // Karyawan user
  await knex('users').where({ username: 'test_karyawan' }).del();
  const hash = await bcrypt.hash('kary123', 12);
  await knex('users').insert({
    nama: 'Test Karyawan', username: 'test_karyawan',
    password: hash, role: 'karyawan', aktif: true
  });

  // ── 1. Owner login + koreksi
  const ownerJar = {};
  await fetchWithCookie(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  }, ownerJar);

  const koreksi = await fetchWithCookie(`${BASE}/api/v1/deposit/${pelId}/koreksi`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saldo_baru: 50000, keterangan: 'Koreksi kesalahan input awal' })
  }, ownerJar);
  console.log('owner koreksi:', koreksi.status, koreksi.body);

  const saldoNow = await knex('deposit_pelanggan').where({ pelanggan_id: pelId }).first();
  console.log('saldo actual:', saldoNow.saldo, '(expected 50000)');
  const check1 = Number(saldoNow.saldo) === 50000;
  console.log('  ', check1 ? '✅' : '❌', 'saldo langsung jadi 50.000 (BUKAN 80.000 dari selisih)');

  const mut = await knex('mutasi_deposit')
    .where({ pelanggan_id: pelId }).orderBy('id','desc').first();
  console.log('mutasi terakhir:', mut.jenis, 'nominal=', mut.nominal,
              'saldo_sebelum=', mut.saldo_sebelum, 'saldo_sesudah=', mut.saldo_sesudah);
  const check2 = mut.jenis === 'koreksi' && Number(mut.nominal) === 20000
                 && Number(mut.saldo_sebelum) === 30000
                 && Number(mut.saldo_sesudah) === 50000;
  console.log('  ', check2 ? '✅' : '❌', 'mutasi tercatat: jenis=koreksi, nominal=+20.000');

  // ── 2. Karyawan login + akses ditolak
  const karyJar = {};
  const karyLogin = await fetchWithCookie(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test_karyawan', password: 'kary123' })
  }, karyJar);
  console.log('karyawan login:', karyLogin.status, karyLogin.body.user);

  const karyKoreksi = await fetchWithCookie(`${BASE}/api/v1/deposit/${pelId}/koreksi`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saldo_baru: 999999, keterangan: 'Percobaan bypass' })
  }, karyJar);
  console.log('karyawan koreksi:', karyKoreksi.status, karyKoreksi.body);
  const check3 = karyKoreksi.status === 403;
  console.log('  ', check3 ? '✅' : '❌', 'karyawan ditolak 403');

  // Verifikasi saldo TIDAK berubah setelah percobaan karyawan
  const saldoAfter = await knex('deposit_pelanggan').where({ pelanggan_id: pelId }).first();
  const check4 = Number(saldoAfter.saldo) === 50000;
  console.log('  ', check4 ? '✅' : '❌', 'saldo tidak berubah setelah percobaan karyawan');

  // ── 3. Koreksi turunkan (test nominal negatif)
  const koreksi2 = await fetchWithCookie(`${BASE}/api/v1/deposit/${pelId}/koreksi`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saldo_baru: 25000, keterangan: 'Koreksi turunkan' })
  }, ownerJar);
  console.log('owner koreksi turun:', koreksi2.status, koreksi2.body);
  const mut2 = await knex('mutasi_deposit')
    .where({ pelanggan_id: pelId }).orderBy('id','desc').first();
  const check5 = mut2.jenis === 'koreksi' && Number(mut2.nominal) === -25000;
  console.log('  ', check5 ? '✅' : '❌', 'koreksi turun mencatat nominal negatif (-25.000)');

  // ── 4. Validasi: keterangan minimal 3 char & saldo_baru wajib >= 0
  const bad1 = await fetchWithCookie(`${BASE}/api/v1/deposit/${pelId}/koreksi`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saldo_baru: -100, keterangan: 'valid' })
  }, ownerJar);
  const check6 = bad1.status === 400;
  console.log('  ', check6 ? '✅' : '❌', 'saldo_baru negatif ditolak 400');

  const bad2 = await fetchWithCookie(`${BASE}/api/v1/deposit/${pelId}/koreksi`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saldo_baru: 10000, keterangan: 'ab' })
  }, ownerJar);
  const check7 = bad2.status === 400;
  console.log('  ', check7 ? '✅' : '❌', 'keterangan < 3 char ditolak 400');

  const ok = check1 && check2 && check3 && check4 && check5 && check6 && check7;
  console.log('\nRESULT:', ok ? '✅ PASS' : '❌ FAIL');

  // Cleanup
  await knex('mutasi_deposit').where({ pelanggan_id: pelId }).del();
  await knex('deposit_pelanggan').where({ pelanggan_id: pelId }).del();
  await knex('pelanggan').where({ id: pelId }).del();
  await knex('users').where({ username: 'test_karyawan' }).del();

  await knex.destroy();
  process.exit(ok ? 0 : 1);
})().catch(async (e) => {
  console.error('ERR:', e);
  try { await knex.destroy(); } catch {}
  process.exit(2);
});
