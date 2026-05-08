/**
 * ============================================
 * payments/click.js
 * Click To'lov Tizimi — To'liq Integratsiya
 *
 * Ishlash tartibi:
 * 1. Foydalanuvchi "Click bilan to'lash" ni bosadi
 * 2. Backend /api/payment/click/create → URL yaratadi
 * 3. Foydalanuvchi Click sahifasiga yo'naltiriladi
 * 4. Click /prepare webhook yuboradi → tekshiramiz
 * 5. Click /complete webhook yuboradi → to'lov tasdiqlandi
 * ============================================
 */

const crypto = require('crypto');

// ── Konstantalar ──────────────────────────
const CLICK_MERCHANT_ID = process.env.CLICK_MERCHANT_ID || '';
const CLICK_SERVICE_ID  = process.env.CLICK_SERVICE_ID  || '';
const CLICK_SECRET_KEY  = process.env.CLICK_SECRET_KEY  || '';

// Test muhiti URL
const CLICK_URL = process.env.CLICK_TEST === 'true'
  ? 'https://my.click.uz/services/pay'   // Test ham shu URL ishlatadi
  : 'https://my.click.uz/services/pay';

// ── Imzo tekshirish (MD5) ──────────────────
function verifyClickSign(body) {
  const {
    click_trans_id,
    service_id,
    click_paydoc_id,
    merchant_trans_id,
    amount,
    action,
    sign_time,
    sign_string,
  } = body;

  const mySign = crypto
    .createHash('md5')
    .update(
      `${click_trans_id}${service_id}${CLICK_SECRET_KEY}${merchant_trans_id}${amount}${action}${sign_time}`
    )
    .digest('hex');

  return mySign === sign_string;
}

// ── Error kodlar ──────────────────────────
const CLICK_ERRORS = {
  SUCCESS:                   0,
  SIGN_FAILED:              -1,
  INVALID_AMOUNT:           -2,
  ACTION_NOT_FOUND:         -3,
  ALREADY_PAID:             -4,
  USER_NOT_FOUND:           -5,
  TRANSACTION_NOT_FOUND:    -6,
  BAD_REQUEST:              -8,
  TRANSACTION_CANCELLED:    -9,
};

// ── To'lov URL yaratish ───────────────────
function createClickUrl(orderId, amount, returnUrl) {
  const params = new URLSearchParams({
    service_id:       CLICK_SERVICE_ID,
    merchant_id:      CLICK_MERCHANT_ID,
    amount:           amount,              // so'mda (tiyin emas)
    transaction_param: orderId,            // bizning order ID
    return_url:       returnUrl || '',
  });

  return `${CLICK_URL}?${params.toString()}`;
}

// ── ROUTES ────────────────────────────────
module.exports = function clickRoutes(router, Order) {

  /**
   * POST /api/payment/click/create
   * Frontend buyurtma berganida Click URL oladi
   *
   * Body: { orderId, returnUrl }
   * Response: { url, amount }
   */
  router.post('/create', async (req, res) => {
    try {
      const { orderId, returnUrl } = req.body;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'orderId talab qilinadi',
        });
      }

      // Buyurtmani topamiz
      const order = await Order.findById(orderId).lean();
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Buyurtma topilmadi',
        });
      }

      if (order.isPaid) {
        return res.status(400).json({
          success: false,
          message: 'Bu buyurtma allaqachon to\'langan',
        });
      }

      // Click URL yaratamiz
      const payUrl = createClickUrl(
        order._id.toString(),
        order.total,
        returnUrl || `${process.env.APP_URL}/track.html?order=${order.orderNum}`
      );

      res.json({
        success: true,
        url:    payUrl,
        amount: order.total,
        orderNum: order.orderNum,
      });

    } catch (err) {
      console.error('Click create xatosi:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * POST /api/payment/click/prepare
   * Click birinchi webhook yuboradi — tekshirish bosqichi
   * Click bu so'rovga sinxron javob kutadi!
   */
  router.post('/prepare', async (req, res) => {
    try {
      console.log('Click PREPARE webhook:', req.body);

      const {
        click_trans_id,
        service_id,
        merchant_trans_id,  // bizning order _id
        amount,
        action,             // 0 = prepare, 1 = complete
      } = req.body;

      // 1. Imzoni tekshirish
      if (!verifyClickSign(req.body)) {
        return res.json({
          click_trans_id,
          merchant_trans_id,
          error:         CLICK_ERRORS.SIGN_FAILED,
          error_note:    'Imzo noto\'g\'ri',
        });
      }

      // 2. Action tekshirish
      if (parseInt(action) !== 0) {
        return res.json({
          click_trans_id,
          merchant_trans_id,
          error:      CLICK_ERRORS.ACTION_NOT_FOUND,
          error_note: 'Noto\'g\'ri action',
        });
      }

      // 3. Buyurtmani topish
      const order = await Order.findById(merchant_trans_id);
      if (!order) {
        return res.json({
          click_trans_id,
          merchant_trans_id,
          error:      CLICK_ERRORS.USER_NOT_FOUND,
          error_note: 'Buyurtma topilmadi',
        });
      }

      // 4. Allaqachon to'langan
      if (order.isPaid) {
        return res.json({
          click_trans_id,
          merchant_trans_id,
          error:      CLICK_ERRORS.ALREADY_PAID,
          error_note: 'Allaqachon to\'langan',
        });
      }

      // 5. Summani tekshirish (±1 so'm farq qabul)
      const diff = Math.abs(parseFloat(amount) - order.total);
      if (diff > 1) {
        return res.json({
          click_trans_id,
          merchant_trans_id,
          error:      CLICK_ERRORS.INVALID_AMOUNT,
          error_note: `Noto'g'ri summa. Kutilgan: ${order.total}, kelgan: ${amount}`,
        });
      }

      // 6. Click trans ID saqlash
      await Order.findByIdAndUpdate(merchant_trans_id, {
        clickTransId:   click_trans_id,
        paymentType:    'click',
        paymentStatus:  'pending',
      });

      // Muvaffaqiyatli
      res.json({
        click_trans_id,
        merchant_trans_id,
        error:      CLICK_ERRORS.SUCCESS,
        error_note: 'Success',
      });

    } catch (err) {
      console.error('Click prepare xatosi:', err);
      res.json({
        click_trans_id:    req.body.click_trans_id,
        merchant_trans_id: req.body.merchant_trans_id,
        error:             CLICK_ERRORS.BAD_REQUEST,
        error_note:        err.message,
      });
    }
  });

  /**
   * POST /api/payment/click/complete
   * Click ikkinchi webhook — to'lov tasdiqlash yoki bekor qilish
   */
  router.post('/complete', async (req, res) => {
    try {
      console.log('Click COMPLETE webhook:', req.body);

      const {
        click_trans_id,
        merchant_trans_id,
        error: clickError,   // 0 = muvaffaqiyat, manfiy = xato
        amount,
        action,
      } = req.body;

      // 1. Imzoni tekshirish
      if (!verifyClickSign(req.body)) {
        return res.json({
          click_trans_id,
          merchant_trans_id,
          error:      CLICK_ERRORS.SIGN_FAILED,
          error_note: 'Imzo noto\'g\'ri',
        });
      }

      // 2. Action tekshirish
      if (parseInt(action) !== 1) {
        return res.json({
          click_trans_id,
          merchant_trans_id,
          error:      CLICK_ERRORS.ACTION_NOT_FOUND,
          error_note: 'Noto\'g\'ri action',
        });
      }

      // 3. Buyurtmani topish
      const order = await Order.findById(merchant_trans_id);
      if (!order) {
        return res.json({
          click_trans_id,
          merchant_trans_id,
          error:      CLICK_ERRORS.TRANSACTION_NOT_FOUND,
          error_note: 'Buyurtma topilmadi',
        });
      }

      // 4. Click tomonidan xato (foydalanuvchi bekor qildi)
      if (parseInt(clickError) < 0) {
        await Order.findByIdAndUpdate(merchant_trans_id, {
          paymentStatus: 'cancelled',
        });
        return res.json({
          click_trans_id,
          merchant_trans_id,
          error:      CLICK_ERRORS.TRANSACTION_CANCELLED,
          error_note: 'To\'lov bekor qilindi',
        });
      }

      // 5. Allaqachon to'langan
      if (order.isPaid) {
        return res.json({
          click_trans_id,
          merchant_trans_id,
          error:      CLICK_ERRORS.ALREADY_PAID,
          error_note: 'Allaqachon to\'langan',
        });
      }

      // 6. Summani tekshirish
      const diff = Math.abs(parseFloat(amount) - order.total);
      if (diff > 1) {
        return res.json({
          click_trans_id,
          merchant_trans_id,
          error:      CLICK_ERRORS.INVALID_AMOUNT,
          error_note: 'Noto\'g\'ri summa',
        });
      }

      // ✅ 7. To'lov muvaffaqiyatli — orderni yangilash
      await Order.findByIdAndUpdate(merchant_trans_id, {
        isPaid:         true,
        paymentType:    'click',
        paymentStatus:  'paid',
        paidAt:         new Date(),
        clickTransId:   click_trans_id,
      });

      console.log(`✅ Click to'lov tasdiqlandi: ${order.orderNum} — ${order.total} so'm`);

      res.json({
        click_trans_id,
        merchant_trans_id,
        error:      CLICK_ERRORS.SUCCESS,
        error_note: 'Success',
      });

    } catch (err) {
      console.error('Click complete xatosi:', err);
      res.json({
        click_trans_id:    req.body.click_trans_id,
        merchant_trans_id: req.body.merchant_trans_id,
        error:             CLICK_ERRORS.BAD_REQUEST,
        error_note:        err.message,
      });
    }
  });

  /**
   * GET /api/payment/click/status/:orderId
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
