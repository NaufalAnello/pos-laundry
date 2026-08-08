// Reproduce Bug 1: DP with Deposit doesn't reduce deposit balance / final amount
// Steps:
//   1. Login as admin
//   2. Ensure test customer exists with saldo deposit 100000
//   3. Create order (DP mode, metode_bayar=deposit, DP nominal 20000, total ~50000)
//   4. Verify server response + DB state
//
// Usage: node scripts/repro_bug1.js
//        node scripts/repro_bug1.js --after-fix   (mimics frontend fix by sending bayar=dpAmount)

const knex = require('knex')(require('../knexfile').development);

const BASE = 'http://localhost:3000';

const afterFix = process.argv.includes('--after-fix');

function fetchWithCookie(url, opts = {}, cookieJar) {
  const headers = { ...(opts.headers || {}) };
  if (cookieJar.cookie) headers['Cookie'] = cookieJar.cookie;
  return fetch(url, { ...opts, headers, redirect: 'manual' }).then(async (r) => {
    const setCookie = r.headers.get('set-cookie');
    if (setCookie) cookieJar.cookie = setCookie.split(';')[0];
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, body };
  });
}

(async () => {
  const jar = {};

  // 1. Login
  const login = await fetchWithCookie(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  }, jar);
  console.log('login:', login.status, login.body);
  if (login.status !== 200) throw new Error('Login gagal');

  // 2. Create test customer + set saldo deposit 100000
  const TEST_TEL = '628999000111';
  await knex('deposit_pelanggan').whereIn('pelanggan_id',
    knex('pelanggan').select('id').where({ telepon: TEST_TEL })).del();
  await knex('mutasi_deposit').whereIn('pelanggan_id',
    knex('pelanggan').select('id').where({ telepon: TEST_TEL })).del();
  await knex('pelanggan').where({ telepon: TEST_TEL }).del();
  const [pelId] = await knex('pelanggan').insert({
    nama: 'Test DPdeposit', telepon: TEST_TEL, created_at: new Date(), updated_at: new Date()
  });
  await knex('deposit_pelanggan').insert({
    pelanggan_id: pelId, saldo: 100000, updated_at: new Date()
  });
  console.log('customer id:', pelId, 'saldo awal: 100000');

  // 3. Grab a layanan with harga ~ 25000 (use first)
  const layanan = await knex('layanan').orderBy('id').first();
  console.log('layanan:', layanan.id, layanan.nama, 'harga', layanan.harga);
  const qty = 6;
  const totalExpected = layanan.harga * qty;
  console.log('total expected:', totalExpected);

  const dpAmount = 20000;

  // 4. Create order via API — DP + deposit
  //    THIS MIMICS EXACTLY what the frontend sends in Bug 1 scenario.
  const body = {
    pelanggan_id: pelId,
    items: [{ layanan_id: layanan.id, jumlah: qty }],
    payment_mode: 'dp',
    is_dp: true,
    metode_bayar: 'deposit',
    // The reproduction toggle: buggy frontend sent `bayar: 0`;
    // fixed frontend should send the actual DP amount.
    bayar: afterFix ? dpAmount : 0,
    kirim_wa: false
  };
  console.log('sending body.bayar =', body.bayar, afterFix ? '(after fix)' : '(bug behavior)');

  const res = await fetchWithCookie(`${BASE}/api/v1/transaksi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, jar);
  console.log('create order:', res.status);
  console.log('  data.bayar        =', res.body.data?.bayar);
  console.log('  data.total_dibayar=', res.body.data?.total_dibayar);
  console.log('  data.total_bayar  =', res.body.data?.total_bayar);
  console.log('  data.tanggal_lunas=', res.body.data?.tanggal_lunas);
  console.log('  deposit_info      =', res.body.deposit_info);

  // 5. Verify DB
  const trxRow = await knex('transaksi').where('id', res.body.data.id).first();
  const depSaldo = await knex('deposit_pelanggan').where('pelanggan_id', pelId).first();
  const mutasi = await knex('mutasi_deposit').where('pelanggan_id', pelId).orderBy('id','desc').limit(3);

  console.log('\nDB verify:');
  console.log('  transaksi.bayar        =', trxRow.bayar);
  console.log('  transaksi.total_dibayar=', trxRow.total_dibayar);
  console.log('  transaksi.total_bayar  =', trxRow.total_bayar);
  console.log('  deposit saldo skrg     =', depSaldo.saldo);
  console.log('  mutasi deposit:');
  mutasi.forEach(m => console.log('    ', m.jenis, 'nominal=', m.nominal, 'saldo_sesudah=', m.saldo_sesudah));

  const sisa = trxRow.total_bayar - trxRow.total_dibayar;
  console.log('\nEXPECTED (skenario DP=20000, saldo awal=100000, total=' + totalExpected + '):');
  console.log('  transaksi.total_dibayar = 20000  (DP tercatat)');
  console.log('  deposit saldo skrg      = 80000  (100000 - 20000)');
  console.log('  sisa tagihan            =', totalExpected - 20000);
  console.log('  actual sisa             =', sisa);

  const ok = trxRow.total_dibayar === dpAmount && depSaldo.saldo === 80000;
  console.log('\nRESULT:', ok ? '✅ PASS' : '❌ FAIL');

  // Cleanup this test order + customer
  await knex('mutasi_deposit').where('pelanggan_id', pelId).del();
  await knex('deposit_pelanggan').where('pelanggan_id', pelId).del();
  await knex('riwayat_bayar').where('transaksi_id', res.body.data.id).del();
  await knex('detail_transaksi').where('transaksi_id', res.body.data.id).del();
  await knex('transaksi').where('id', res.body.data.id).del();
  await knex('pelanggan').where('id', pelId).del();
  console.log('cleanup done');

  await knex.destroy();
  process.exit(ok ? 0 : 1);
})().catch(async (e) => {
  console.error('ERR:', e);
  try { await knex.destroy(); } catch {}
  process.exit(2);
});
