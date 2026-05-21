const express = require('express');
const router  = express.Router();
const Joi     = require('joi');
const depositModel  = require('../models/deposit.model');
const pelangganModel = require('../models/pelangganModel');
const waService     = require('../services/wa.service');
const db            = require('../database/connection');

// ── GET /api/v1/deposit/ringkasan ────────────────────────────────────────────
router.get('/ringkasan', async (req, res) => {
  try {
    const data = await depositModel.getRingkasan();
    res.json({ data });
  } catch (err) {
    console.error('[deposit:ringkasan]', err);
    res.status(500).json({ error: 'Gagal mengambil ringkasan deposit' });
  }
});

// ── GET /api/v1/deposit ── daftar saldo semua pelanggan ──────────────────────
router.get('/', async (req, res) => {
  try {
    const { q = '', page = 1, limit = 30 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const query = db('pelanggan as p')
      .leftJoin('deposit_pelanggan as d', 'd.pelanggan_id', 'p.id')
      .orderBy('d.saldo', 'desc')
      .select(
        'p.id', 'p.nama', 'p.telepon',
        db.raw('COALESCE(d.saldo, 0) as saldo'),
        'd.updated_at as saldo_updated_at'
      );

    if (q) {
      query.where(function () {
        this.where('p.nama', 'like', `%${q}%`).orWhere('p.telepon', 'like', `%${q}%`);
      });
    }

    const [rows, countRow, ringkasan] = await Promise.all([
      query.clone().limit(Number(limit)).offset(offset),
      query.clone().count('p.id as total').first(),
      depositModel.getRingkasan()
    ]);

    res.json({
      data: rows,
      meta: { total: Number(countRow?.total ?? 0), page: Number(page), limit: Number(limit) },
      ringkasan
    });
  } catch (err) {
    console.error('[deposit:index]', err);
    res.status(500).json({ error: 'Gagal mengambil data deposit' });
  }
});

// ── GET /api/v1/deposit/:pelangganId ─────────────────────────────────────────
router.get('/:pelangganId', async (req, res) => {
  try {
    const pel = await pelangganModel.findById(req.params.pelangganId);
    if (!pel) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

    const [saldoRow, mutasiTerakhir] = await Promise.all([
      depositModel.getSaldo(req.params.pelangganId),
      depositModel.getMutasi(req.params.pelangganId, { limit: 5 })
    ]);

    res.json({
      data: {
        pelanggan:     pel,
        saldo:         Number(saldoRow.saldo),
        mutasi_terakhir: mutasiTerakhir
      }
    });
  } catch (err) {
    console.error('[deposit:show]', err);
    res.status(500).json({ error: 'Gagal mengambil data deposit pelanggan' });
  }
});

// ── POST /api/v1/deposit/:pelangganId/topup ──────────────────────────────────
router.post('/:pelangganId/topup', async (req, res) => {
  const { error, value } = Joi.object({
    nominal:     Joi.number().positive().required(),
    metode_bayar: Joi.string().valid('tunai', 'transfer', 'qris').default('tunai'),
    keterangan:  Joi.string().allow('', null)
  }).validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const pel = await pelangganModel.findById(req.params.pelangganId);
    if (!pel) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

    const saldoBaru = await depositModel.topup({
      pelangganId:  req.params.pelangganId,
      nominal:      value.nominal,
      metodeBayar:  value.metode_bayar,
      keterangan:   value.keterangan,
      createdBy:    req.session?.user?.id
    });

    res.json({ message: 'Top-up berhasil', saldo: saldoBaru });
  } catch (err) {
    console.error('[deposit:topup]', err);
    res.status(500).json({ error: 'Gagal top-up deposit' });
  }
});

// ── GET /api/v1/deposit/:pelangganId/mutasi ──────────────────────────────────
router.get('/:pelangganId/mutasi', async (req, res) => {
  try {
    const pel = await pelangganModel.findById(req.params.pelangganId);
    if (!pel) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const [rows, countRow, saldoRow] = await Promise.all([
      depositModel.getMutasi(req.params.pelangganId, { limit, offset }),
      depositModel.countMutasi(req.params.pelangganId),
      depositModel.getSaldo(req.params.pelangganId)
    ]);

    res.json({
      data:  rows,
      saldo: Number(saldoRow.saldo),
      meta:  { total: Number(countRow?.total ?? 0), page, limit }
    });
  } catch (err) {
    console.error('[deposit:mutasi]', err);
    res.status(500).json({ error: 'Gagal mengambil mutasi deposit' });
  }
});

// ── GET /api/v1/deposit/mutasi/semua ─ semua mutasi dengan filter ────────────
router.get('/mutasi/semua', async (req, res) => {
  try {
    const { pelanggan_id, jenis, start, end, page = 1, limit = 30 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const query = db('mutasi_deposit as m')
      .leftJoin('pelanggan as p',  'p.id', 'm.pelanggan_id')
      .leftJoin('transaksi as t',  't.id', 'm.transaksi_id')
      .leftJoin('users as u',      'u.id', 'm.created_by')
      .orderBy('m.id', 'desc')
      .select(
        'm.*',
        'p.nama as pelanggan_nama', 'p.telepon as pelanggan_telepon',
        't.nomor_transaksi',
        'u.nama as operator_nama'
      );

    if (pelanggan_id) query.where('m.pelanggan_id', pelanggan_id);
    if (jenis)        query.where('m.jenis', jenis);
    if (start)        query.whereRaw("date(m.created_at) >= ?", [start]);
    if (end)          query.whereRaw("date(m.created_at) <= ?", [end]);

    const [rows, countRow] = await Promise.all([
      query.clone().limit(Number(limit)).offset(offset),
      query.clone().count('m.id as total').first()
    ]);

    res.json({
      data: rows,
      meta: { total: Number(countRow?.total ?? 0), page: Number(page), limit: Number(limit) }
    });
  } catch (err) {
    console.error('[deposit:mutasi-semua]', err);
    res.status(500).json({ error: 'Gagal mengambil mutasi deposit' });
  }
});

// ── GET /api/v1/deposit/mutasi/export ── export CSV ─────────────────────────
router.get('/mutasi/export', async (req, res) => {
  try {
    const { pelanggan_id, jenis, start, end } = req.query;

    const query = db('mutasi_deposit as m')
      .leftJoin('pelanggan as p', 'p.id', 'm.pelanggan_id')
      .leftJoin('transaksi as t', 't.id', 'm.transaksi_id')
      .leftJoin('users as u',     'u.id', 'm.created_by')
      .orderBy('m.created_at', 'asc')
      .select(
        'm.created_at', 'p.nama as pelanggan', 'p.telepon',
        'm.jenis', 'm.nominal', 'm.saldo_sebelum', 'm.saldo_sesudah',
        'm.keterangan', 'm.metode_bayar', 't.nomor_transaksi',
        'u.nama as operator'
      );

    if (pelanggan_id) query.where('m.pelanggan_id', pelanggan_id);
    if (jenis)        query.where('m.jenis', jenis);
    if (start)        query.whereRaw("date(m.created_at) >= ?", [start]);
    if (end)          query.whereRaw("date(m.created_at) <= ?", [end]);

    const rows = await query;

    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const BOM = '﻿';
    const header = ['Tanggal','Pelanggan','Telepon','Jenis','Nominal','Saldo Sebelum','Saldo Sesudah','Keterangan','Metode Bayar','No Transaksi','Operator'];
    const csv = BOM + [
      header.map(escape).join(','),
      ...rows.map(r => [
        r.created_at, r.pelanggan, r.telepon, r.jenis,
        r.nominal, r.saldo_sebelum, r.saldo_sesudah,
        r.keterangan, r.metode_bayar, r.nomor_transaksi, r.operator
      ].map(escape).join(','))
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mutasi-deposit.csv"');
    res.send(csv);
  } catch (err) {
    console.error('[deposit:export]', err);
    res.status(500).json({ error: 'Gagal export CSV' });
  }
});

module.exports = router;
