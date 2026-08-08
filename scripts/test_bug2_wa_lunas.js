// Test end-to-end untuk template WA khusus Pelunasan.
// Steps:
//   1. Login
//   2. Create pelanggan test + saldo deposit
//   3. Create order dengan status belum lunas
//   4. Lunasi order dengan metode deposit
//   5. Fetch pesan WA nota (lama) VS pesan WA lunas (baru) — pastikan BEDA
//
// Usage: node scripts/test_bug2_wa_lunas.js

const knex = require('knex')(require('../knexfile').development);
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
  const jar = {};

  const login = await fetchWithCookie(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  }, jar);
  if (login.status !== 200) throw new Error('login gagal');

  const TEL = '628999000222';
  // Clean up previous test data
  const oldPel = await knex('pelanggan').where({ telepon: TEL }).first();
  if (oldPel) {
    await knex('mutasi_deposit').where({ pelanggan_id: oldPel.id }).del();
    await knex('deposit_pelanggan').where({ pelanggan_id: oldPel.id }).del();
    const oldTrx = await knex('transaksi').where({ pelanggan_id: oldPel.id });
    for (const tt of oldTrx) {
      await knex('riwayat_bayar').where({ transaksi_id: tt.id }).del();
      await knex('detail_transaksi').where({ transaksi_id: tt.id }).del();
      await knex('kas').where({ transaksi_id: tt.id }).del();
      await knex('wa_log').where({ transaksi_id: tt.id }).del();
      await knex('biaya_tambahan').where({ transaksi_id: tt.id }).del();
    }
    await knex('transaksi').where({ pelanggan_id: oldPel.id }).del();
    await knex('pelanggan').where({ id: oldPel.id }).del();
  }

  const [pelId] = await knex('pelanggan').insert({
    nama: 'Test Lunas WA', telepon: TEL, created_at: new Date(), updated_at: new Date()
  });
  await knex('deposit_pelanggan').insert({
    pelanggan_id: pelId, saldo: 100000, updated_at: new Date()
  });

  // Create order (bayar-nanti)
  const layanan = await knex('layanan').orderBy('id').first();
  const qty = 3;
  const totalExpected = layanan.harga * qty;
  const create = await fetchWithCookie(`${BASE}/api/v1/transaksi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pelanggan_id: pelId,
      items: [{ layanan_id: layanan.id, jumlah: qty }],
      payment_mode: 'bayar-nanti',
      metode_bayar: 'tunai',
      bayar: 0,
      kirim_wa: false
    })
  }, jar);
  if (create.status !== 201) { console.log('create resp:', create); throw new Error('create gagal'); }
  const orderId = create.body.data.id;
  const orderNomor = create.body.data.nomor_transaksi;
  console.log('order dibuat:', orderNomor, 'total:', totalExpected);

  // Lunasi pakai deposit
  const lunasi = await fetchWithCookie(`${BASE}/api/v1/transaksi/${orderId}/lunasi`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      metode_bayar: 'deposit',
      nominal_diterima: totalExpected,
      kelebihan_ke_deposit: false
    })
  }, jar);
  console.log('lunasi status:', lunasi.status, 'lunas:', lunasi.body.lunas);
  if (!lunasi.body.lunas) throw new Error('lunasi tidak menghasilkan status lunas');

  // Fetch template nota (order baru) VS template lunas (baru)
  const nota  = await fetchWithCookie(`${BASE}/api/v1/transaksi/${orderId}/wa/nota`,  { method: 'GET' }, jar);
  const lunas = await fetchWithCookie(`${BASE}/api/v1/transaksi/${orderId}/wa/lunas`, { method: 'GET' }, jar);
  console.log('nota status:', nota.status);
  console.log('lunas status:', lunas.status);

  console.log('\n═════════════════ PESAN NOTA (LAMA) ═════════════════');
  console.log(nota.body.teks);
  console.log('\n═════════════════ PESAN LUNAS (BARU) ════════════════');
  console.log(lunas.body.teks);
  console.log('═══════════════════════════════════════════════════════');

  const notaTxt  = nota.body.teks  || '';
  const lunasTxt = lunas.body.teks || '';

  // Assertions:
  const check1 = lunasTxt !== notaTxt;
  const check2 = /LUNAS/i.test(lunasTxt);
  const check3 = /Deposit/i.test(lunasTxt);
  const check4 = lunasTxt.includes(orderNomor);
  // Nota lama tidak menyebut "LUNAS" secara eksplisit
  const check5 = !/PEMBAYARAN LUNAS/i.test(notaTxt);

  console.log('\nCEK ASSERSI:');
  console.log(`  ${check1 ? '✅' : '❌'} pesan lunas ≠ pesan nota`);
  console.log(`  ${check2 ? '✅' : '❌'} pesan lunas menyebutkan "LUNAS"`);
  console.log(`  ${check3 ? '✅' : '❌'} pesan lunas menyebutkan metode "Deposit"`);
  console.log(`  ${check4 ? '✅' : '❌'} pesan lunas berisi nomor order`);
  console.log(`  ${check5 ? '✅' : '❌'} pesan nota TIDAK menyebut "PEMBAYARAN LUNAS"`);

  const ok = check1 && check2 && check3 && check4 && check5;
  console.log('\nRESULT:', ok ? '✅ PASS' : '❌ FAIL');

  // Cleanup
  await knex('mutasi_deposit').where('pelanggan_id', pelId).del();
  await knex('deposit_pelanggan').where('pelanggan_id', pelId).del();
  await knex('riwayat_bayar').where('transaksi_id', orderId).del();
  await knex('detail_transaksi').where('transaksi_id', orderId).del();
  await knex('kas').where('transaksi_id', orderId).del();
  await knex('wa_log').where('transaksi_id', orderId).del();
  await knex('biaya_tambahan').where('transaksi_id', orderId).del();
  await knex('transaksi').where('id', orderId).del();
  await knex('pelanggan').where('id', pelId).del();

  await knex.destroy();
  process.exit(ok ? 0 : 1);
})().catch(async (e) => {
  console.error('ERR:', e);
  try { await knex.destroy(); } catch {}
  process.exit(2);
});
