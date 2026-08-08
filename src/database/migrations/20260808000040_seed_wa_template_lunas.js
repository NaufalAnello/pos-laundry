// Seed template pesan WA khusus notifikasi pelunasan.
// Dipisah dari nota order biasa supaya bisa jadi bukti transaksi lunas.
// Idempoten: cek keberadaan row sebelum insert.
exports.up = async function (knex) {
  const kunci = 'wa_template_lunas';
  const exists = await knex('pengaturan').where({ kunci }).first();
  if (exists) return;

  const nilai = `✅ *PEMBAYARAN LUNAS*

Halo {nama} 👋
Pembayaran laundry Anda telah *LUNAS* ✅

🧾 *Order: {nomor}*
💰 Total: Rp {total}
💳 Metode: {metode_bayar}
📅 Dibayar: {tanggal_lunas}

Terima kasih atas pembayarannya!
Cucian siap diambil sesuai estimasi.

_Bukti pembayaran ini sah, simpan sebagai referensi._
_— {nama_toko} —_`;

  await knex('pengaturan').insert({
    kunci,
    nilai,
    deskripsi: 'Template pesan WA saat order dilunasi (bukti pembayaran)',
    created_at: new Date(),
    updated_at: new Date()
  });
};

exports.down = async function (knex) {
  await knex('pengaturan').where({ kunci: 'wa_template_lunas' }).del();
};
