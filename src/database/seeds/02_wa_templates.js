// Hanya insert jika kunci belum ada — aman dijalankan berulang
exports.seed = async function (knex) {
  const upsert = async (kunci, nilai, deskripsi) => {
    const exists = await knex('pengaturan').where({ kunci }).first();
    if (!exists) {
      await knex('pengaturan').insert({ kunci, nilai, deskripsi, created_at: new Date(), updated_at: new Date() });
    }
  };

  await upsert('struk_lebar', '80mm',
    'Lebar kertas struk termal: 58mm | 80mm | A5');

  await upsert('wa_template_nota',
    `Halo {nama} 👋

Terima kasih telah mempercayakan laundry Anda kepada kami! 🧺

🧾 *Order: {nomor}*
📅 Masuk     : {tanggal_masuk}
⏰ Est. Selesai: {tanggal_selesai}

📋 *Detail Pesanan:*
{items}

💵 Subtotal   : Rp {subtotal}
🏷️ Diskon     : Rp {diskon}
💰 *Total Bayar: Rp {total}*
💳 Bayar      : Rp {bayar}
💵 Kembalian  : Rp {kembalian}

⭐ Poin didapat : +{poin_dapat} poin
💎 Total poin  : {poin_total} poin

Kami akan segera memproses pesanan Anda.
Terima kasih & sampai jumpa! 🙏

_— {nama_toko} —_`,
    'Template pesan WA saat order baru dibuat');

  await upsert('wa_template_tagihan',
    `Halo {nama} 👋

Mengingatkan bahwa laundry Anda *belum lunas* 🔔

🧾 *{nomor}*
📅 Masuk : {tanggal_masuk}
💰 *Sisa Tagihan: Rp {total}*

Silakan lakukan pembayaran saat pengambilan.
Hubungi kami jika ada pertanyaan.

📍 {alamat_toko}
📞 {telepon_toko}

Terima kasih! 🙏

_— {nama_toko} —_`,
    'Template pesan WA pengingat tagihan');

  await upsert('wa_template_notif_selesai',
    `Halo {nama} 👋

Kabar gembira! Laundry Anda sudah *selesai* dan siap diambil! 🎉👕

🧾 *{nomor}*
✅ Status: Selesai diproses

Silakan ambil di:
📍 {alamat_toko}
📞 {telepon_toko}
🕐 Jam operasional: {jam_operasional}

Terima kasih sudah mempercayakan laundry kepada kami! 🙏

_— {nama_toko} —_`,
    'Template pesan WA notifikasi order selesai');

  await upsert('jam_operasional', '08.00 - 21.00 WIB',
    'Jam operasional toko');

  console.log('✓ Seed 02: WA templates & struk settings selesai');
};
