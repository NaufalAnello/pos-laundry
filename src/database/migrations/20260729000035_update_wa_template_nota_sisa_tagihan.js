exports.up = async function (knex) {
  // Template lama (sebelum ada sisa_tagihan_block)
  const oldTemplate = `Halo {nama} 👋

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

_— {nama_toko} —_`;

  // Template baru (dengan sisa_tagihan_block)
  const newTemplate = `Halo {nama} 👋

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
{sisa_tagihan_block}

⭐ Poin didapat : +{poin_dapat} poin
💎 Total poin  : {poin_total} poin

Kami akan segera memproses pesanan Anda.
Terima kasih & sampai jumpa! 🙏

_— {nama_toko} —_`;

  // Update HANYA jika masih menggunakan template default lama
  // (tidak menimpa kustomisasi user)
  const current = await knex('pengaturan')
    .where({ kunci: 'wa_template_nota' })
    .first();

  if (current && current.nilai === oldTemplate) {
    await knex('pengaturan')
      .where({ kunci: 'wa_template_nota' })
      .update({
        nilai: newTemplate,
        updated_at: new Date()
      });
    console.log('✓ Template WA nota berhasil diupdate dengan placeholder sisa_tagihan_block');
  } else if (current) {
    console.log('⚠️ Template WA nota sudah dikustomisasi, tidak diupdate otomatis');
    console.log('   Tambahkan manual placeholder {sisa_tagihan_block} di halaman Pengaturan');
  }
};

exports.down = async function (knex) {
  // Rollback: kembalikan ke template lama jika masih pakai template baru hasil migration ini
  const newTemplate = `Halo {nama} 👋

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
{sisa_tagihan_block}

⭐ Poin didapat : +{poin_dapat} poin
💎 Total poin  : {poin_total} poin

Kami akan segera memproses pesanan Anda.
Terima kasih & sampai jumpa! 🙏

_— {nama_toko} —_`;

  const oldTemplate = `Halo {nama} 👋

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

_— {nama_toko} —_`;

  const current = await knex('pengaturan')
    .where({ kunci: 'wa_template_nota' })
    .first();

  if (current && current.nilai === newTemplate) {
    await knex('pengaturan')
      .where({ kunci: 'wa_template_nota' })
      .update({
        nilai: oldTemplate,
        updated_at: new Date()
      });
  }
};
