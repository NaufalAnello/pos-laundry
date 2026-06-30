// Definisi default & validasi config template cetak (struk & label).
// Dipakai bersama oleh printer.service.js (rendering) dan
// pengaturanController.js (API GET/PUT).

// Daftar SEMUA elemen yang bisa ditampilkan, urut sesuai default UI.
// Urutan default untuk STRUK = SAMA PERSIS dengan generateEscPos lama,
// supaya zero-regression saat operator belum pernah menyimpan template.
const STRUK_DEFAULT_ORDER = [
  'nama_toko',
  'alamat_toko',
  'telepon_toko',
  'nomor_order',
  'tanggal',
  'nama_pelanggan',
  'nomor_wa',
  'kasir',
  'daftar_layanan',
  'biaya_tambahan',
  'diskon',
  'total',
  'status_bayar',
  'estimasi_selesai',
  'footer',
  'instruksi_ambil',
];

// Urutan default LABEL = sesuai generateLabelEscPos lama (ringkas).
// Elemen yang ada di list ini di-aktifkan secara default; selain itu nonaktif.
const LABEL_DEFAULT_ORDER = [
  'nomor_order',
  'nama_pelanggan',
  'nomor_wa',
  'estimasi_selesai',
  'daftar_layanan',
  'biaya_tambahan',
  'total',
  'status_bayar',
  'instruksi_ambil',
];

// Semua elemen yang valid (urutan default UI: header → info → items → footer)
const ALL_ELEMENTS = [
  'nama_toko', 'alamat_toko', 'telepon_toko',
  'nomor_order', 'tanggal', 'kasir',
  'nama_pelanggan', 'nomor_wa',
  'estimasi_selesai',
  'daftar_layanan', 'biaya_tambahan',
  'diskon', 'total', 'status_bayar',
  'footer', 'instruksi_ambil',
];

// Label "ramah" untuk ditampilkan di UI
const ELEMENT_LABELS = {
  nama_toko:        'Nama Toko',
  alamat_toko:      'Alamat Toko',
  telepon_toko:     'Telepon Toko',
  nomor_order:      'Nomor Order',
  tanggal:          'Tanggal',
  kasir:            'Nama Kasir',
  nama_pelanggan:   'Nama Pelanggan',
  nomor_wa:         'Nomor WA',
  estimasi_selesai: 'Estimasi Selesai',
  daftar_layanan:   'Daftar Layanan',
  biaya_tambahan:   'Biaya Tambahan',
  diskon:           'Diskon',
  total:            'Total',
  status_bayar:     'Status Bayar',
  footer:           'Footer / Ucapan',
  instruksi_ambil:  'Instruksi Ambil',
};

// Elemen wajib — tidak boleh di-disable
const REQUIRED_ELEMENTS = new Set([
  'nomor_order', 'nama_pelanggan', 'total', 'status_bayar',
]);

function buildDefault(jenis) {
  const aktifSet = new Set(jenis === 'label' ? LABEL_DEFAULT_ORDER : STRUK_DEFAULT_ORDER);

  // Susun urutan: untuk struk pakai STRUK_DEFAULT_ORDER + elemen lain yg belum termasuk;
  // untuk label, taruh elemen aktif sesuai LABEL_DEFAULT_ORDER lalu sisanya pakai
  // urutan ALL_ELEMENTS supaya konsisten dengan UI.
  const orderSource = jenis === 'label'
    ? [...LABEL_DEFAULT_ORDER, ...ALL_ELEMENTS.filter(id => !aktifSet.has(id))]
    : [...STRUK_DEFAULT_ORDER, ...ALL_ELEMENTS.filter(id => !STRUK_DEFAULT_ORDER.includes(id))];

  const elemen = orderSource.map((id, i) => ({
    id,
    aktif: aktifSet.has(id),
    urutan: i + 1,
  }));

  return { elemen };
}

const DEFAULT_STRUK = buildDefault('struk');
const DEFAULT_LABEL = buildDefault('label');

// Parse JSON string dari kolom pengaturan.nilai → normalisasi → return config valid.
// Jika invalid atau parse error, return null (pemanggil bisa fallback ke default).
function parseConfig(nilaiRaw, jenis) {
  if (!nilaiRaw) return null;
  let parsed;
  try {
    parsed = typeof nilaiRaw === 'string' ? JSON.parse(nilaiRaw) : nilaiRaw;
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.elemen)) return null;

  return normalizeConfig(parsed, jenis);
}

// Normalisasi: pastikan semua ALL_ELEMENTS ada (tambah yg hilang sebagai nonaktif),
// pastikan REQUIRED_ELEMENTS aktif, dan urutan stabil 1..N.
function normalizeConfig(config, jenis) {
  const def = jenis === 'label' ? DEFAULT_LABEL : DEFAULT_STRUK;
  const fromUser = new Map();
  for (const el of config.elemen) {
    if (el && typeof el.id === 'string' && ALL_ELEMENTS.includes(el.id)) {
      fromUser.set(el.id, {
        id: el.id,
        aktif: el.aktif !== false,
        urutan: Number.isFinite(el.urutan) ? Number(el.urutan) : 9999,
      });
    }
  }

  // Tambahkan elemen yang belum ada dari user (pakai default-nya)
  for (const d of def.elemen) {
    if (!fromUser.has(d.id)) {
      fromUser.set(d.id, { id: d.id, aktif: d.aktif, urutan: d.urutan + 1000 });
    }
  }

  // Paksa elemen wajib aktif
  for (const reqId of REQUIRED_ELEMENTS) {
    const e = fromUser.get(reqId);
    if (e) e.aktif = true;
  }

  // Sort + reindex urutan 1..N
  const arr = Array.from(fromUser.values())
    .sort((a, b) => a.urutan - b.urutan)
    .map((e, i) => ({ id: e.id, aktif: !!e.aktif, urutan: i + 1 }));

  return { elemen: arr };
}

// Validasi body PUT — return { ok, error?, config? }
function validateIncoming(body, jenis) {
  if (!body || !Array.isArray(body.elemen)) {
    return { ok: false, error: 'Body harus berisi { elemen: [...] }' };
  }
  // Pastikan elemen wajib tidak di-disable
  for (const el of body.elemen) {
    if (el && REQUIRED_ELEMENTS.has(el.id) && el.aktif === false) {
      return { ok: false, error: `Elemen "${ELEMENT_LABELS[el.id] || el.id}" wajib tidak boleh dinonaktifkan` };
    }
  }
  const normalized = normalizeConfig(body, jenis);
  return { ok: true, config: normalized };
}

module.exports = {
  ALL_ELEMENTS,
  ELEMENT_LABELS,
  REQUIRED_ELEMENTS: Array.from(REQUIRED_ELEMENTS),
  DEFAULT_STRUK,
  DEFAULT_LABEL,
  parseConfig,
  normalizeConfig,
  validateIncoming,
};
