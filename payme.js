/**
 * ============================================
 * payments/payme.js
 * Payme To'lov Tizimi — To'liq Integratsiya
 *
 * Payme JSONRPC 2.0 protokoli ishlatadi.
 *
 * Ishlash tartibi:
 * 1. Frontend /api/payment/payme/url → to'lov URL
 * 2. Foydalanuvchi Payme sahifasida to'laydi
 * 3. Payme CheckPerformTransaction webhook
 * 4. Payme CreateTransaction webhook
 * 5. Payme PerformTransaction → to'lov tasdiqlandi ✅
 * ============================================
 */

const crypto = require('crypto');

// ── Konstantalar ──────────────────────────
const PAYME_MERCHANT_ID  = process.env.PAYME_MERCHANT_ID  || '';
const PAYME_SECRET_KEY   = process.env.PAYME_SECRET_KEY   || '';
const PAYME_TEST         = process.env.PAYME_TEST === 'true';

const PAYME_URL = PAYME_TEST
  ? 'https://checkout.test.paycom.uz'
  : 'https://checkout.paycom.uz';

// ── Error kodlar (Payme standart) ────────
const ERR = {
  INVALID_AMOUNT:        { code: -31001, message: { uz: 'Noto\'g\'ri summa', ru: 'Неверная сумма', en: 'Invalid amount' } },
  TRANSACTION_NOT_FOUND: { code: -31003, message: { uz: 'Tranzaksiya topilmadi', ru: 'Транзакция не найдена', en: 'Transaction not found' } },
  CANNOT_PERFORM:        { code: -31008, message: { uz: 'Bajarib bo\'lmaydi', ru: 'Невозможно выполнить', en: 'Cannot perform' } },
  CANNOT_CANCEL:         { code: -31007, message: { uz: 'Bekor qilib bo\'lmaydi', ru: 'Невозможно отменить', en: 'Cannot cancel' } },
  ORDER_NOT_FOUND:       { code: -31050, message: { uz: 'Buyurtma topilmadi', ru: 'Заказ не найден', en: 'Order not found' } },
  ALREADY_PAID:          { code: -31099, message: { uz: 'Allaqachon to\'langan', ru: 'Уже оплачено', en: 'Already paid' } },
  INTERNAL:              { code: -32400, message: { uz: 'Server xatosi', ru: 'Ошибка сервера', en: 'Internal error' } },
};

// ── Basic Auth tekshirish ─────────────────
function checkAuth(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return false;
  const decoded = Buffer.from(auth.split(' ')[1], 'base64').toString('utf8');
  // Format: "Paycom:SECRET_KEY"
  const [, secret] = decoded.split(':');
  return secret === PAYME_SECRET_KEY;
}

// ── JSONRPC javob yordamchi ───────────────
function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, err) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code: err.code, message: err.message, data: null },
  };
}

// ── To'lov URL yaratish ───────────────────
// Payme URL: base64(m=MERCHANT_ID;ac.order_id=ORDER_ID;a=AMOUNT_TIYIN)
function createPaymeUrl(orderId, amountSom) {
  const amountTiyin = Math.round(amountSom * 100); // so'm → tiyin
  const params = Buffer.from(
    `m=${PAYME_MERCHANT_ID};ac.order_id=${orderId};a=${amountTiyin}`
  ).toString('base64');
  return `${PAYME_URL}/${params}`;
}

// ── In-memory tranzaksiyalar (MongoDB ga saqlanadi) ──
// Payme tranzaksiyalarini saqlaymiz
async function findPaymeTransaction(PaymeTransaction, paymeId) {
  return await PaymeTransaction.findOne({ paymeId }).lean();
}

// ── ROUTES ────────────────────────────────
module.exports = function paymeRoutes(router, Order, PaymeTransaction) {

  /**
   * GET /api/payment/payme/url/:orderId
   * Frontend Payme to'lov URL oladi
   */
  router.get('/url/:orderId', async (req, res) => {
    try {
      const order = await Order.findById(req.params.orderId).lean();
      if (!order) {
        return res.status(404).json({ success: false, message: 'Buyurtma topilmadi' });
      }
      if (order.isPaid) {
        return res.status(400).json({ success: false, message: 'Allaqachon to\'langan' });
      }

      const url = createPaymeUrl(order._id.toString(), order.total);
      res.json({ success: true, url, amount: order.total, orderNum: order.orderNum });

    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * POST /api/payment/payme
   * Payme JSONRPC webhook — barcha methodlar shu endpoint ga keladi
   */
  router.post('/', async (req, res) => {
    // Auth tekshirish
    if (!checkAuth(req)) {
      return res.status(401).json(
        rpcError(req.body?.id, { code: -32504, message: { uz: 'Ruxsat yo\'q', ru: 'Нет доступа', en: 'Unauthorized' } })
      );
    }

    const { method, params, id } = req.body;
    console.log(`Payme webhook: ${method}`, params);

    try {
      switch (method) {

        // ── 1. CheckPerformTransaction ────────────────
        // Payme to'lovdan avval buyurtmani tekshiradi
        case 'CheckPerformTransaction': {
          const orderId = params?.account?.order_id;
          const amount  = params?.amount; // tiyin da

          if (!orderId) {
            return res.json(rpcError(id, ERR.ORDER_NOT_FOUND));
          }

          const order = await Order.findById(orderId).lean();
          if (!order) {
            return res.json(rpcError(id, ERR.ORDER_NOT_FOUND));
          }

          if (order.isPaid) {
            return res.json(rpcError(id, ERR.ALREADY_PAID));
          }

          // Summani tekshirish (tiyin da)
          const expectedTiyin = Math.round(order.total * 100);
          const diff = Math.abs(parseInt(amount) - expectedTiyin);
          if (diff > 100) { // 1 so'm farq qabul
            return res.json(rpcError(id, ERR.INVALID_AMOUNT));
          }

          return res.json(rpcResult(id, { allow: true }));
        }

        // ── 2. CreateTransaction ──────────────────────
        // Payme tranzaksiya yaratadi
        case 'CreateTransaction': {
          const orderId = params?.account?.order_id;
          const paymeId = params?.id;
          const amount  = params?.amount;
          const time    = params?.time;

          // Mavjud tranzaksiyani tekshirish
          const existing = await PaymeTransaction.findOne({ paymeId });
          if (existing) {
            if (existing.state !== 1) {
              return res.json(rpcError(id, ERR.CANNOT_PERFORM));
            }
            return res.json(rpcResult(id, {
              create_time: existing.createTime,
              transaction: existing._id.toString(),
              state:       existing.state,
            }));
          }

          // Buyurtmani topish
          const order = await Order.findById(orderId);
          if (!order) return res.json(rpcError(id, ERR.ORDER_NOT_FOUND));
          if (order.isPaid) return res.json(rpcError(id, ERR.ALREADY_PAID));

          // Summani tekshirish
          const expectedTiyin = Math.round(order.total * 100);
          if (Math.abs(parseInt(amount) - expectedTiyin) > 100) {
            return res.json(rpcError(id, ERR.INVALID_AMOUNT));
          }

          // Yangi tranzaksiya yaratish
          const txn = await PaymeTransaction.create({
            paymeId,
            orderId,
            amount:      parseInt(amount),
            state:       1,           // yaratildi, kutilmoqda
            createTime:  time || Date.now(),
          });

          // Orderni yangilash
          await Order.findByIdAndUpdate(orderId, {
            paymeTransId:  paymeId,
            paymentType:   'payme',
            paymentStatus: 'pending',
          });

          return res.json(rpcResult(id, {
            create_time: txn.createTime,
            transaction: txn._id.toString(),
            state:       txn.state,
          }));
        }

        // ── 3. PerformTransaction ─────────────────────
        // To'lov muvaffaqiyatli — tasdiqlash
        case 'PerformTransaction': {
          const paymeId = params?.id;

          const txn = await PaymeTransaction.findOne({ paymeId });
          if (!txn) return res.json(rpcError(id, ERR.TRANSACTION_NOT_FOUND));

          // Allaqachon bajarilgan
          if (txn.state === 2) {
            return res.json(rpcResult(id, {
              transaction:    txn._id.toString(),
              perform_time:   txn.performTime,
              state:          txn.state,
            }));
          }

          if (txn.state !== 1) {
            return res.json(rpcError(id, ERR.CANNOT_PERFORM));
          }

          const performTime = Date.now();

          // Tranzaksiyani yangilash
          await PaymeTransaction.findByIdAndUpdate(txn._id, {
            state:       2,           // bajarildi
            performTime,
          });

          // ✅ Orderni to'langan deb belgilash
          await Order.findByIdAndUpdate(txn.orderId, {
            isPaid:        true,
            paymentType:   'payme',
            paymentStatus: 'paid',
            paidAt:        new Date(),
          });

          console.log(`✅ Payme to'lov tasdiqlandi: orderID=${txn.orderId}`);

          return res.json(rpcResult(id, {
            transaction:  txn._id.toString(),
            perform_time: performTime,
            state:        2,
          }));
        }

        // ── 4. CancelTransaction ──────────────────────
        // To'lov bekor qilindi
        case 'CancelTransaction': {
          const paymeId = params?.id;
          const reason  = params?.reason;

          const txn = await PaymeTransaction.findOne({ paymeId });
          if (!txn) return res.json(rpcError(id, ERR.TRANSACTION_NOT_FOUND));

          // Bajarilgan tranzaksiyani bekor qilib bo'lmaydi (buyurtma yetkazilgan bo'lsa)
          if (txn.state === 2) {
            const order = await Order.findById(txn.orderId).lean();
            if (order?.status === 'done') {
              return res.json(rpcError(id, ERR.CANNOT_CANCEL));
            }
          }

          const cancelTime = Date.now();
          const cancelState = txn.state === 1 ? -1 : -2; // -1: yaratilgandan bekor, -2: bajarilgandan bekor

          await PaymeTransaction.findByIdAndUpdate(txn._id, {
            state:      cancelState,
            cancelTime,
            reason,
          });

          await Order.findByIdAndUpdate(txn.orderId, {
            isPaid:        false,
            paymentStatus: 'cancelled',
          });

          console.log(`❌ Payme to'lov bekor: orderID=${txn.orderId}, reason=${reason}`);

          return res.json(rpcResult(id, {
            transaction: txn._id.toString(),
            cancel_time: cancelTime,
            state:       cancelState,
          }));
        }

        // ── 5. CheckTransaction ───────────────────────
        // Tranzaksiya holati
        case 'CheckTransaction': {
          const paymeId = params?.id;
          const txn = await PaymeTransaction.findOne({ paymeId });
          if (!txn) return res.json(rpcError(id, ERR.TRANSACTION_NOT_FOUND));

          return res.json(rpcResult(id, {
            create_time:  txn.createTime  || 0,
            perform_time: txn.performTime || 0,
            cancel_time:  txn.cancelTime  || 0,
            transaction:  txn._id.toString(),
            state:        txn.state,
            reason:       txn.reason || null,
          }));
        }

        // ── 6. GetStatement ───────────────────────────
        // Muayyan vaqt oralig'idagi tranzaksiyalar
        case 'GetStatement': {
          const { from, to } = params || {};
          const txns = await PaymeTransaction.find({
            createTime: { $gte: parseInt(from), $lte: parseInt(to) },
          }).lean();

          return res.json(rpcResult(id, {
            transactions: txns.map(t => ({
              id:           t.paymeId,
              time:         t.createTime,
              amount:       t.amount,
              account:      { order_id: t.orderId.toString() },
              create_time:  t.createTime  || 0,
              perform_time: t.performTime || 0,
              cancel_time:  t.cancelTime  || 0,
              transaction:  t._id.toString(),
              state:        t.state,
              reason:       t.reason || null,
            })),
          }));
        }

        // ── Noma'lum method ───────────────────────────
        default:
          return res.json(rpcError(id, {
            code:    -32601,
            message: { uz: 'Method topilmadi', ru: 'Метод не найден', en: 'Method not found' },
          }));
      }

    } catch (err) {
      console.error('Payme webhook xatosi:', err);
      return res.json(rpcError(id, ERR.INTERNAL));
    }
  });

  /**
   * GET /api/payment/payme/status/:orderId
   * Frontend to'lov holatini tekshiradi
   */
  router.get('/status/:orderId', async (req, res) => {
    try {
      const order = await Order.findById(req.params.orderId)
        .select('isPaid paymentType paymentStatus orderNum total paidAt')
        .lean();

      if (!order) {
        return res.status(404).json({ success: false, message: 'Buyurtma topilmadi' });
      }

      res.json({
        success:       true,
        isPaid:        order.isPaid,
        paymentType:   order.paymentType,
        paymentStatus: order.paymentStatus || 'pending',
        orderNum:      order.orderNum,
        total:         order.total,
        paidAt:        order.paidAt,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
};
