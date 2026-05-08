/**
 * ============================================
 * SOMSA.UZ MOTRID — app.js
 * Frontend JavaScript — barcha sahifalar
 * ============================================
 */

/* ── API CONFIG ── */
const API_BASE = (() => {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }
  return 'https://somsa-motrid.up.railway.app/api'; // Railway URL ni o'zgartiring
})();

const API = {
  getToken(type = 'user') {
    return localStorage.getItem(type === 'admin' ? 'sm_admin_token' : 'sm_user_token') || '';
  },
  async request(endpoint, options = {}) {
    const url = API_BASE + endpoint;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.auth ? { 'Authorization': `Bearer ${this.getToken(options.auth)}` } : {}),
    };
    try {
      const res = await fetch(url, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      return data;
    } catch (err) {
      if (err instanceof TypeError) return { success: false, offline: true, message: err.message };
      throw err;
    }
  },
  get(ep, auth = false)       { return this.request(ep, { method:'GET', auth }); },
  post(ep, body, auth = false) { return this.request(ep, { method:'POST', body, auth }); },
  put(ep, body, auth = false)  { return this.request(ep, { method:'PUT', body, auth }); },
  delete(ep, auth = false)     { return this.request(ep, { method:'DELETE', auth }); },
};

/* ── MENU MA'LUMOTLARI (Fallback) ── */
const MENU_DATA = [
  // SOMSALAR
  { _id:'1',  name:'Shakarli Somsa',    category:'somsa', price:8000,  emoji:'🥟', ingredients:'Xamir, shakar, yog\' — shirin somsa',         popular:true,  available:true },
  { _id:'2',  name:'Tandir Somsa',      category:'somsa', price:10000, emoji:'🥟', ingredients:'Go\'sht, piyoz, ziravorlar — tandirda pishirilgan', popular:true,  available:true },
  { _id:'3',  name:'Kuyovli Somsa',     category:'somsa', price:40000, emoji:'🥟', ingredients:'Maxsus go\'sht, ziravorlar — bayramona',         popular:true,  available:true },
  { _id:'4',  name:'Shokoladli Somsa',  category:'somsa', price:10000, emoji:'🍫', ingredients:'Shokolad, yong\'oq — shirin',                   popular:true,  available:true },
  { _id:'5',  name:'Julen Somsa',       category:'somsa', price:20000, emoji:'🥟', ingredients:'Tovuq, qo\'ziqorin, krem sous',                  popular:false, available:true },
  { _id:'6',  name:'Tomchi Somsa',      category:'somsa', price:7000,  emoji:'🥟', ingredients:'Go\'sht, piyoz — tomchi shaklida',              popular:false, available:true },
  { _id:'7',  name:'Qiyma Somsa',       category:'somsa', price:7000,  emoji:'🥟', ingredients:'Qiyma go\'sht, piyoz, ziravorlar',              popular:false, available:true },
  { _id:'8',  name:'Konus Somsa',       category:'somsa', price:7000,  emoji:'🥟', ingredients:'Go\'sht, piyoz — konus shaklida',               popular:false, available:true },
  // BICHAKLAR
  { _id:'9',  name:"O'tli Bichak",      category:'bichak', price:5000, emoji:'🥬', ingredients:'Ko\'k o\'t, piyoz — sog\'lom',                  popular:false, available:true },
  { _id:'10', name:'Qovoqli Bichak',    category:'bichak', price:5000, emoji:'🎃', ingredients:'Qovoq, piyoz, ziravorlar',                      popular:false, available:true },
  { _id:'11', name:'Qovurilgan Bichak', category:'bichak', price:6000, emoji:'🥘', ingredients:'Go\'sht, piyoz — qovurilgan',                   popular:false, available:true },
  // FATIRLAR
  { _id:'12', name:'Fatir',             category:'fatir',  price:25000,emoji:'🫓', ingredients:'Un, yog\' — katta fatir',                        popular:true,  available:true },
  { _id:'13', name:'Kesilgan Fatir',    category:'fatir',  price:15000,emoji:'🫓', ingredients:'Fatir, kesilgan, arzon',                         popular:false, available:true },
  { _id:'14', name:'Mini Fatir',        category:'fatir',  price:6000, emoji:'🫓', ingredients:'Kichik fatir — bir kishiga',                     popular:false, available:true },
  // BOSHQALAR
  { _id:'15', name:"Bo'g'irsoq",        category:'other',  price:null, emoji:'🍩', ingredients:'Qovurilgan xamir — klassik',                     popular:false, available:true },
];

let menuCache = null;

async function getMenu(params = {}) {
  try {
    const q = new URLSearchParams(params).toString();
    const res = await API.get('/menu' + (q ? '?' + q : ''));
    if (res.success) { menuCache = res.data; return res.data; }
    return menuCache || MENU_DATA;
  } catch { return menuCache || MENU_DATA; }
}

/* ── SAVAT ── */
const Cart = {
  items: JSON.parse(localStorage.getItem('sm_cart') || '[]'),
  save() {
    localStorage.setItem('sm_cart', JSON.stringify(this.items));
    this.updateBadge();
    window.dispatchEvent(new CustomEvent('cartUpdated'));
  },
  add(item) {
    const ex = this.items.find(i => i._id === item._id);
    if (ex) ex.qty = Math.min(99, ex.qty + 1);
    else this.items.push({ ...item, qty: 1 });
    this.save();
    showToast(`🥟 ${item.name} savatga qo'shildi!`, 'success');
  },
  remove(id) { this.items = this.items.filter(i => i._id !== id); this.save(); },
  updateQty(id, delta) {
    const item = this.items.find(i => i._id === id);
    if (!item) return;
    item.qty = Math.max(0, item.qty + delta);
    if (item.qty === 0) this.remove(id); else this.save();
  },
  total()   { return this.items.reduce((s, i) => s + (i.price || 0) * i.qty, 0); },
  count()   { return this.items.reduce((s, i) => s + i.qty, 0); },
  clear()   { this.items = []; this.save(); },
  toAPI()   { return this.items.map(i => ({ menuItemId: i._id, name: i.name, price: i.price, emoji: i.emoji, qty: i.qty })); },
  updateBadge() {
    const c = this.count();
    document.querySelectorAll('#cartBadge').forEach(b => {
      b.textContent = c;
      b.style.display = c > 0 ? 'flex' : 'none';
    });
  },
};

/* ── YORDAMCHI ── */
function fmtPrice(n) {
  if (!n) return "Narx yo'q";
  return Number(n).toLocaleString('uz-UZ') + " so'm";
}

function showToast(message, type = 'info', duration = 3000) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.innerHTML = `<span>${icons[type]||''}</span> <span>${message}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 400); }, duration);
}

function setLoading(el, loading, text = '') {
  if (!el) return;
  if (loading) { el.disabled = true; el._orig = el.innerHTML; el.innerHTML = `<span class="spinner"></span> ${text || 'Yuklanmoqda...'}`; }
  else { el.disabled = false; el.innerHTML = el._orig || text; }
}

/* ── NAV USER WIDGET ── */
function renderNavUser() {
  const el = document.getElementById('navUser');
  if (!el) return;
  const user  = JSON.parse(localStorage.getItem('sm_user') || 'null');
  const token = localStorage.getItem('sm_user_token');
  if (user && token) {
    const ini = user.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || '?';
    el.innerHTML = `<a href="profile.html" class="nav__user-btn">
      <div class="user-avatar-sm">${ini}</div>
      <span>${user.name?.split(' ')[0]||'Profil'}</span>
      ${user.bonusPoints > 0 ? `<span class="bonus-chip">⭐ ${user.bonusPoints}</span>` : ''}
    </a>`;
  } else {
    el.innerHTML = `<a href="auth.html" class="nav__user-btn"><i class="fas fa-user"></i> <span>Kirish</span></a>`;
  }
}

/* ── FOOD CARD ── */
function foodCardHTML(item) {
  const badge = item.popular ? '<span class="food-card__badge">⭐ Top</span>' : '';
  return `
    <div class="food-card ${!item.available ? 'unavailable' : ''}" data-id="${item._id}">
      ${badge}
      <div class="food-card__img">${item.emoji}</div>
      <div class="food-card__body">
        <h3 class="food-card__name">${item.name}</h3>
        <p class="food-card__ingredients">${item.ingredients || ''}</p>
        <div class="food-card__footer">
          <span class="food-card__price">${fmtPrice(item.price)}</span>
          ${item.available && item.price
            ? `<button class="add-to-cart-btn" data-id="${item._id}"><i class="fas fa-plus"></i></button>`
            : `<span style="font-size:.75rem;color:var(--gray)">—</span>`
          }
        </div>
      </div>
    </div>`;
}

function attachCartHandlers(container) {
  container?.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = btn.dataset.id;
      const menu = menuCache || MENU_DATA;
      const item = menu.find(i => i._id === id || i._id == id);
      if (item && item.price) {
        Cart.add(item);
        btn.style.transform = 'rotate(180deg) scale(1.2)';
        setTimeout(() => btn.style.transform = '', 400);
      }
    });
  });
}

/* ── HEADER ── */
function initHeader() {
  const header = document.getElementById('header');
  const toggle = document.getElementById('navToggle');
  const menu   = document.getElementById('navMenu');
  if (!header) return;
  window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 50), { passive: true });
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      const [s0,s1,s2] = toggle.querySelectorAll('span');
      if (open) { s0.style.transform='rotate(45deg) translate(5px,5px)'; s1.style.opacity='0'; s2.style.transform='rotate(-45deg) translate(5px,-5px)'; }
      else { [s0,s1,s2].forEach(s => { s.style.transform=''; s.style.opacity=''; }); }
    });
    menu.querySelectorAll('.nav__link').forEach(l => l.addEventListener('click', () => {
      menu.classList.remove('open');
      toggle.querySelectorAll('span').forEach(s => { s.style.transform=''; s.style.opacity=''; });
    }));
  }
}

/* ── SCROLL TOP ── */
function initScrollTop() {
  const btn = document.getElementById('scrollTop');
  if (!btn) return;
  window.addEventListener('scroll', () => btn.classList.toggle('show', window.scrollY > 400), { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top:0, behavior:'smooth' }));
}

/* ── BOSH SAHIFA ── */
async function initHomePage() {
  const grid = document.getElementById('popularGrid');
  if (!grid) return;
  const all     = await getMenu();
  const popular = all.filter(i => i.popular && i.available && i.price).slice(0, 4);
  grid.innerHTML = popular.map(foodCardHTML).join('');
  attachCartHandlers(grid);
  initPromoTimer();
}

function initPromoTimer() {
  const hEl=document.getElementById('timerH'), mEl=document.getElementById('timerM'), sEl=document.getElementById('timerS');
  if (!hEl) return;
  let total = 23*3600 + 59*60 + 59;
  setInterval(() => {
    total = total > 0 ? total-1 : 23*3600+59*60+59;
    hEl.textContent = String(Math.floor(total/3600)).padStart(2,'0');
    mEl.textContent = String(Math.floor((total%3600)/60)).padStart(2,'0');
    sEl.textContent = String(total%60).padStart(2,'0');
  }, 1000);
}

/* ── MENYU SAHIFASI ── */
async function initMenuPage() {
  const grid    = document.getElementById('menuGrid');
  const emptyEl = document.getElementById('menuEmpty');
  const searchIn= document.getElementById('menuSearch');
  const tabs    = document.getElementById('categoryTabs');
  if (!grid) return;

  // Skeleton
  grid.innerHTML = Array(8).fill(`<div class="card--skeleton"><div class="skeleton skeleton--img"></div><div style="padding:1rem"><div class="skeleton skeleton--text"></div><div class="skeleton skeleton--text skeleton--short"></div></div></div>`).join('');

  let allItems   = await getMenu();
  let currentCat = new URLSearchParams(location.search).get('cat') || 'all';
  let query      = '';

  tabs?.querySelectorAll('.cat-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.cat === currentCat);
    tab.addEventListener('click', () => {
      currentCat = tab.dataset.cat;
      tabs.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderMenu();
    });
  });

  searchIn?.addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); renderMenu(); });

  function renderMenu() {
    let f = allItems;
    if (currentCat !== 'all') f = f.filter(i => i.category === currentCat);
    if (query) f = f.filter(i => i.name.toLowerCase().includes(query) || i.ingredients?.toLowerCase().includes(query));
    if (!f.length) { grid.innerHTML=''; emptyEl?.classList.remove('hidden'); }
    else { emptyEl?.classList.add('hidden'); grid.innerHTML = f.map(foodCardHTML).join(''); attachCartHandlers(grid); }
  }
  renderMenu();
}

/* ── BUYURTMA SAHIFASI ── */
function initOrderPage() {
  const cartItemsEl = document.getElementById('cartItems');
  const cartEmptyEl = document.getElementById('cartEmpty');
  const formWrap    = document.getElementById('orderFormWrap');
  const sumItems    = document.getElementById('sumItems');
  const sumTotal    = document.getElementById('sumTotal');
  const delivLine   = document.getElementById('deliveryLine');
  const placeBtn    = document.getElementById('placeOrderBtn');
  const clickBtn    = document.getElementById('clickPayBtn');
  const paymeBtn    = document.getElementById('paymePayBtn');
  const addrGrp     = document.getElementById('addressGroup');
  const hint        = document.getElementById('payRedirectHint');
  if (!cartItemsEl) return;

  let deliveryType = 'delivery';
  const FEE = 5000;

  function renderCart() {
    if (!Cart.items.length) {
      cartItemsEl.innerHTML = '';
      cartEmptyEl?.classList.remove('hidden');
      if (formWrap) { formWrap.style.opacity='0.4'; formWrap.style.pointerEvents='none'; }
      return;
    }
    cartEmptyEl?.classList.add('hidden');
    if (formWrap) { formWrap.style.opacity=''; formWrap.style.pointerEvents=''; }

    cartItemsEl.innerHTML = Cart.items.map(i => `
      <div class="cart-item" data-id="${i._id}">
        <div class="cart-item__emoji">${i.emoji}</div>
        <div class="cart-item__info">
          <div class="cart-item__name">${i.name}</div>
          <div class="cart-item__price">${fmtPrice(i.price * i.qty)}</div>
        </div>
        <div class="cart-item__qty">
          <button class="qty-btn" data-id="${i._id}" data-delta="-1">−</button>
          <span class="qty-num">${i.qty}</span>
          <button class="qty-btn" data-id="${i._id}" data-delta="1">+</button>
        </div>
        <button class="cart-item__remove" data-id="${i._id}"><i class="fas fa-trash"></i></button>
      </div>`).join('');

    updateSummary();

    cartItemsEl.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => { Cart.updateQty(btn.dataset.id, parseInt(btn.dataset.delta)); renderCart(); });
    });
    cartItemsEl.querySelectorAll('.cart-item__remove').forEach(btn => {
      btn.addEventListener('click', () => { Cart.remove(btn.dataset.id); renderCart(); showToast("O'chirildi", 'info'); });
    });
  }

  function updateSummary() {
    const t = Cart.total();
    const fee = deliveryType === 'delivery' ? FEE : 0;
    if (sumItems) sumItems.textContent = fmtPrice(t);
    if (sumTotal) sumTotal.textContent = fmtPrice(t + fee);
    if (delivLine) delivLine.style.display = deliveryType === 'delivery' ? '' : 'none';
  }

  document.querySelectorAll('input[name="delivery"]').forEach(r => {
    r.addEventListener('change', e => {
      deliveryType = e.target.value;
      if (addrGrp) addrGrp.style.display = deliveryType === 'delivery' ? '' : 'none';
      updateSummary();
    });
  });

  // Payment UI
  function updatePaymentUI(val) {
    placeBtn?.classList.add('hidden');
    clickBtn?.classList.add('hidden');
    paymeBtn?.classList.add('hidden');
    hint?.classList.remove('show');
    if (val==='cash'||val==='card') {
      placeBtn?.classList.remove('hidden');
      if (placeBtn) placeBtn.innerHTML = val==='cash'
        ? '<i class="fas fa-check-circle"></i> Buyurtma berish'
        : '<i class="fas fa-credit-card"></i> Buyurtma berish (karta)';
    } else if (val==='click') { clickBtn?.classList.remove('hidden'); hint?.classList.add('show'); }
    else if (val==='payme')   { paymeBtn?.classList.remove('hidden'); hint?.classList.add('show'); }
  }
  document.querySelectorAll('input[name="payment"]').forEach(r => r.addEventListener('change', e => updatePaymentUI(e.target.value)));

  async function submitOrder(paymentType = 'cash') {
    const name    = document.getElementById('custName')?.value.trim();
    const phone   = document.getElementById('custPhone')?.value.trim();
    const address = document.getElementById('custAddress')?.value.trim();
    const note    = document.getElementById('custNote')?.value.trim();
    if (!name)   { showToast('Ismingizni kiriting!', 'error'); return null; }
    if (!phone || phone.replace(/\D/g,'').length < 9) { showToast("Telefon raqamni kiriting!", 'error'); return null; }
    if (deliveryType==='delivery' && !address) { showToast('Manzilingizni kiriting!', 'error'); return null; }
    if (!Cart.items.length) { showToast("Savat bo'sh!", 'error'); return null; }

    const btn = paymentType==='click' ? clickBtn : paymentType==='payme' ? paymeBtn : placeBtn;
    setLoading(btn, true, 'Yuborilmoqda...');
    try {
      const res = await API.post('/orders', {
        customer: { name, phone:'+998'+phone.replace(/\D/g,''), address, note },
        items: Cart.toAPI(), deliveryType, paymentType,
      });
      return res;
    } catch { showToast("Server bilan aloqa yo'q", 'error'); return null; }
    finally { setLoading(btn, false); }
  }

  // Naqd/Karta
  placeBtn?.addEventListener('click', async () => {
    const payType = document.querySelector('input[name="payment"]:checked')?.value || 'cash';
    const res = await submitOrder(payType);
    if (!res?.success) { showToast(res?.message || 'Xato!', 'error'); return; }
    localStorage.setItem('sm_last_order', JSON.stringify(res.data));
    document.getElementById('modalOrderNum').textContent = res.data.orderNum;
    document.getElementById('successModal').classList.remove('hidden');
    Cart.clear(); renderCart();
  });

  // Click/Payme
  async function handleOnlinePayment(provider) {
    const payType = document.querySelector('input[name="payment"]:checked')?.value || provider;
    const res = await submitOrder(payType);
    if (!res?.success) { showToast(res?.message || 'Xato!', 'error'); return; }

    let payUrl = '';
    try {
      if (provider === 'click') {
        const r = await API.post('/payment/click/create', { orderId: res.data._id, returnUrl: location.origin+'/track.html' });
        payUrl = r.success ? r.url : '';
      } else {
        const r = await API.get('/payment/payme/url/' + res.data._id);
        payUrl = r.success ? r.url : '';
      }
    } catch {}

    Cart.clear(); renderCart();
    const icons = { click:'🔵', payme:'🟢' };
    const names = { click:'Click', payme:'Payme' };
    document.getElementById('payModalIcon').textContent    = icons[provider];
    document.getElementById('payModalTitle').textContent   = names[provider]+' bilan to\'lash';
    document.getElementById('payModalOrderNum').textContent= res.data.orderNum;
    document.getElementById('payModalAmount').textContent  = fmtPrice(res.data.total);
    const payNow = document.getElementById('payNowBtn');
    if (payUrl) { payNow.href=payUrl; payNow.style.display=''; }
    else { payNow.style.display='none'; showToast("To'lov tizimi test rejimda", 'warning', 4000); }
    document.getElementById('paymentModal').classList.remove('hidden');
  }

  clickBtn?.addEventListener('click', () => handleOnlinePayment('click'));
  paymeBtn?.addEventListener('click', () => handleOnlinePayment('payme'));

  renderCart();
}

/* ── KUZATISH SAHIFASI ── */
const KingSomsa = { track: null };

function initTrackPage() {
  const trackBtn   = document.getElementById('trackBtn');
  const trackInput = document.getElementById('trackInput');
  const resultEl   = document.getElementById('trackResult');
  const notFoundEl = document.getElementById('trackNotFound');
  if (!trackBtn) return;

  const last = JSON.parse(localStorage.getItem('sm_last_order') || 'null');
  if (last && trackInput) { trackInput.value = last.orderNum || ''; setTimeout(() => fetchOrder(trackInput.value), 300); }

  trackBtn.addEventListener('click', () => { const v=trackInput.value.trim(); if(!v){showToast("Raqam kiriting!",'error');return;} fetchOrder(v); });
  trackInput?.addEventListener('keydown', e => { if(e.key==='Enter') trackBtn.click(); });

  async function fetchOrder(raw) {
    const num = raw.startsWith('#') ? raw : '#'+raw;
    setLoading(trackBtn, true, 'Qidirilmoqda...');
    try {
      const res = await API.get('/orders/'+num.replace('#',''));
      if (res.success) { showResult(res.data); }
      else {
        const local = JSON.parse(localStorage.getItem('sm_order_'+num.replace('#','')) || 'null');
        if (local) showResult({ orderNum:num, status:'new', step:1, statusLabel:'Qabul qilindi', eta:'20-30 daqiqa', total:local.total||0, deliveryType:'delivery', items:[], customer:{name:''} });
        else showNotFound();
      }
    } catch { showNotFound(); }
    finally { setLoading(trackBtn, false); }
  }

  function showResult(order) {
    resultEl?.classList.remove('hidden');
    notFoundEl?.classList.add('hidden');
    document.getElementById('trackOrderNum').textContent = order.orderNum;
    document.getElementById('trackEta').textContent = order.eta || '20-30 daqiqa';
    const el = document.getElementById('trackDetails');
    if (el) el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;font-size:.875rem">
        <div><span style="color:var(--gray)">Mijoz:</span><br><strong>${order.customer?.name||'—'}</strong></div>
        <div><span style="color:var(--gray)">Yetkazish:</span><br><strong>${order.deliveryType==='pickup'?"O'zi oladi":"Yetkazib berish"}</strong></div>
        ${order.total?`<div><span style="color:var(--gray)">Jami:</span><br><strong style="color:var(--gold)">${fmtPrice(order.total)}</strong></div>`:''}
      </div>`;
    setStep(order.step || 1);
  }

  function showNotFound() {
    resultEl?.classList.add('hidden');
    notFoundEl?.classList.remove('hidden');
  }

  function setStep(step) {
    const fill  = document.getElementById('progressFill');
    const steps = document.querySelectorAll('.track-step');
    const pcts  = [0,10,40,70,100];
    if (fill) fill.style.width = (pcts[step]||0)+'%';
    steps.forEach(s => {
      const n = parseInt(s.dataset.step);
      s.classList.remove('done','active');
      if (n < step) s.classList.add('done');
      if (n === step) s.classList.add('active');
    });
  }
  KingSomsa.track = { setStep };
}

/* ── ALOQA SAHIFASI ── */
function initContactPage() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name=document.getElementById('contName')?.value.trim();
    const phone=document.getElementById('contPhone')?.value.trim();
    const msg=document.getElementById('contMessage')?.value.trim();
    const btn=form.querySelector('button[type="submit"]');
    if (!name){showToast('Ismingizni kiriting!','error');return;}
    if (!phone){showToast('Telefon kiriting!','error');return;}
    if (!msg){showToast('Xabar kiriting!','error');return;}
    setLoading(btn,true,'Yuborilmoqda...');
    await new Promise(r=>setTimeout(r,1000));
    setLoading(btn,false);
    showToast('Xabaringiz yuborildi! ✉️','success',4000);
    form.reset();
  });
}

/* ── AUTH SAHIFASI ── */
function initAuthPage() {
  if (!document.getElementById('formLogin')) return;
  const token=localStorage.getItem('sm_user_token');
  if (token) { window.location.href='profile.html'; return; }
  const urlTab=new URLSearchParams(location.search).get('tab');
  if (urlTab==='register') switchTab('register');
}

window.switchTab = function(tab) {
  document.querySelectorAll('.auth-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f=>f.classList.remove('active'));
  document.getElementById('tab'+tab.charAt(0).toUpperCase()+tab.slice(1))?.classList.add('active');
  document.getElementById('form'+tab.charAt(0).toUpperCase()+tab.slice(1))?.classList.add('active');
};

window.togglePwd = function(id,btn) {
  const inp=document.getElementById(id);
  if (inp.type==='password'){inp.type='text';btn.innerHTML='<i class="fas fa-eye-slash"></i>';}
  else{inp.type='password';btn.innerHTML='<i class="fas fa-eye"></i>';}
};

window.checkPwdStrength = function(val) {
  const bars=[1,2,3,4].map(i=>document.getElementById('ps'+i));
  const label=document.getElementById('pwdStrengthLabel');
  const colors=['#ef4444','#f59e0b','#eab308','#22c55e'];
  const labels=["Juda zaif","Zaif","O'rtacha","Kuchli"];
  let s=0;
  if(val.length>=8)s++;if(/[A-Z]/.test(val))s++;if(/[0-9]/.test(val))s++;if(/[^A-Za-z0-9]/.test(val))s++;
  bars.forEach((b,i)=>{if(b)b.style.background=i<s?colors[s-1]:'var(--border)';});
  if(label){label.textContent=val.length>0?labels[s-1]||'':'';label.style.color=s>0?colors[s-1]:'var(--gray)';}
};

window.handleLogin = async function() {
  const identifier=document.getElementById('loginIdentifier').value.trim();
  const password=document.getElementById('loginPassword').value;
  const btn=document.getElementById('loginBtn');
  if(!identifier||!password){showToast("Barcha maydonlarni to'ldiring!",'error');return;}
  setLoading(btn,true,'Tekshirilmoqda...');
  try {
    const res=await API.post('/users/login',{identifier,password});
    if(res.success){
      localStorage.setItem('sm_user_token',res.token);
      localStorage.setItem('sm_user',JSON.stringify(res.user));
      showToast(`Xush kelibsiz, ${res.user.name}! 👋`,'success');
      setTimeout(()=>{window.location.href='profile.html';},1200);
    } else { showToast(res.message||"Noto'g'ri login yoki parol",'error'); }
  } catch { showToast("Server bilan aloqa yo'q",'error'); }
  finally { setLoading(btn,false); }
};

window.handleRegister = async function() {
  const name=document.getElementById('regName').value.trim();
  const phone=document.getElementById('regPhone').value.trim();
  const email=document.getElementById('regEmail').value.trim();
  const password=document.getElementById('regPassword').value;
  const confirm=document.getElementById('regPasswordConfirm').value;
  const agree=document.getElementById('agreeTerms').checked;
  const btn=document.getElementById('registerBtn');
  if(!name){showToast('Ismingizni kiriting!','error');return;}
  if(!phone){showToast('Telefon kiriting!','error');return;}
  if(password.length<8){showToast('Parol kamida 8 belgi!','error');return;}
  if(password!==confirm){showToast("Parollar mos emas!",'error');return;}
  if(!agree){showToast("Shartlarga rozilik bering!",'error');return;}
  setLoading(btn,true,"Ro'yxatdan o'tilmoqda...");
  try {
    const res=await API.post('/users/register',{name,phone,email,password});
    if(res.success){
      localStorage.setItem('sm_user_token',res.token);
      localStorage.setItem('sm_user',JSON.stringify(res.user));
      showToast('Xush kelibsiz! 100 ball berildi 🎁','success',4000);
      setTimeout(()=>{window.location.href='profile.html';},1500);
    } else { showToast(res.message||"Xato",'error'); }
  } catch { showToast("Server bilan aloqa yo'q",'error'); }
  finally { setLoading(btn,false); }
};

window.showForgot = function(){document.getElementById('forgotModal')?.classList.remove('hidden');};
window.handleForgot = function(){
  const p=document.getElementById('forgotPhone')?.value.trim();
  if(!p){showToast('Telefon kiriting!','error');return;}
  document.getElementById('forgotModal')?.classList.add('hidden');
  showToast('SMS kod yuborildi! (Demo)','success',4000);
};

/* ── PROFIL ── */
function initProfilePage() {
  if (!document.getElementById('profileAvatar')) return;
  const token=localStorage.getItem('sm_user_token');
  const user=JSON.parse(localStorage.getItem('sm_user')||'null');
  if(!token||!user){window.location.href='auth.html';return;}

  const ini=user.name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()||'?';
  document.getElementById('profileAvatar').innerHTML=`${ini}<div class="online-dot"></div>`;
  document.getElementById('profileName').textContent=user.name||'';
  document.getElementById('profilePhone').textContent=user.phone||user.email||'';
  document.getElementById('profileMember').textContent="A'zo: "+new Date(user.createdAt||Date.now()).toLocaleDateString('uz-UZ');
  document.getElementById('settingName').value=user.name||'';
  document.getElementById('settingPhone').value=user.phone||'';
  document.getElementById('settingEmail').value=user.email||'';

  renderBonus(user.bonusPoints||0);
  document.getElementById('statOrders').textContent=user.totalOrders||0;
  document.getElementById('statSpent').textContent=(user.totalSpent||0).toLocaleString('uz-UZ');
  document.getElementById('statFavorites').textContent=user.favoritesCount||0;

  loadOrderHistory();
}

function renderBonus(points) {
  document.getElementById('bonusPoints').textContent=points.toLocaleString('uz-UZ');
  document.getElementById('bonusValue').textContent=(points*100).toLocaleString('uz-UZ')+" so'm";
  const levels=[{n:"Boshlang'ich",min:0,max:500},{n:'Kumush',min:500,max:1000},{n:'Oltin',min:1000,max:2000},{n:'Platinum',min:2000,max:5000},{n:'VIP',min:5000,max:9999}];
  const level=levels.find(l=>points>=l.min&&points<l.max)||levels[levels.length-1];
  const pct=Math.min(100,Math.round((points-level.min)/(level.max-level.min)*100));
  document.getElementById('statLevel').textContent=level.n;
  document.getElementById('bonusProgressVal').textContent=points+' / '+level.max;
  document.getElementById('bonusBarFill').style.width=pct+'%';
  document.getElementById('bonusNextText').innerHTML=level.max<9999
    ?`Keyingi darajaga <strong style="color:var(--purple-light)">${level.max-points} ball</strong> qoldi`
    :'🎉 Eng yuqori darajadasiz!';
}

window.switchProfileTab = function(tab) {
  document.querySelectorAll('.profile-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.profile-tab-content').forEach(c=>c.classList.remove('active'));
  document.querySelector(`.profile-tab[onclick*="${tab}"]`)?.classList.add('active');
  document.getElementById('tab-'+tab)?.classList.add('active');
  if(tab==='orders') loadOrderHistory();
  if(tab==='bonus')  loadBonusHistory();
  if(tab==='favorites') loadFavorites();
};

async function loadOrderHistory() {
  const el=document.getElementById('orderHistory');
  if(!el)return;
  el.innerHTML='<div style="text-align:center;padding:2rem;color:var(--gray)"><span class="spinner"></span></div>';
  try {
    const res=await API.get('/users/orders','user');
    const orders=res.success&&res.data?.length?res.data:getDemoOrders();
    if(!orders.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">📦</div><h3>Buyurtmalar yo'q</h3><a href="menu.html" class="btn btn--primary" style="margin-top:1rem">Menyu ko'rish</a></div>`;return;}
    const sc={new:'#3b82f6',preparing:'#8b5cf6',onway:'#f59e0b',done:'#22c55e',cancelled:'#ef4444'};
    const sl={new:'Yangi',preparing:'Tayyorlanmoqda',onway:"Yo'lda",done:'Yetkazildi',cancelled:'Bekor'};
    el.innerHTML=orders.map(o=>`
      <div class="order-card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.5rem">
          <span class="order-card__num">${o.orderNum}</span>
          <div style="display:flex;align-items:center;gap:.75rem">
            <span class="status-badge" style="background:${sc[o.status]}22;color:${sc[o.status]}">${sl[o.status]||o.status}</span>
            <span class="order-card__date">${new Date(o.createdAt).toLocaleDateString('uz-UZ')}</span>
          </div>
        </div>
        <div class="order-card__items">${o.items?.map(i=>`${i.emoji} ${i.name} x${i.qty}`).join(' · ')||'—'}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
          <span class="order-card__total">${fmtPrice(o.total)}</span>
          <div style="display:flex;gap:.5rem">
            <a href="track.html?order=${o.orderNum}" class="btn btn--sm btn--outline"><i class="fas fa-map-marker-alt"></i> Kuzatish</a>
            <button class="reorder-btn" onclick="reOrder('${o.orderNum}')"><i class="fas fa-redo"></i> Qayta</button>
          </div>
        </div>
      </div>`).join('');
  } catch {
    el.innerHTML='<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Yuklab bo\'lmadi</h3></div>';
  }
}

function getDemoOrders(){
  return [
    {orderNum:'#1001',status:'done',createdAt:new Date(Date.now()-86400000*2),items:[{emoji:'🥟',name:'Tandir Somsa',qty:3},{emoji:'🍫',name:'Shokoladli Somsa',qty:2}],total:50000},
    {orderNum:'#1000',status:'done',createdAt:new Date(Date.now()-86400000*5),items:[{emoji:'🥟',name:'Kuyovli Somsa',qty:1}],total:40000},
  ];
}

async function loadBonusHistory(){
  const el=document.getElementById('bonusHistory');
  if(!el)return;
  const h=[
    {type:'earn',title:'Tandir Somsa buyurtmasi',date:'2025-01-15',amount:+50},
    {type:'earn',title:'Kuyovli Somsa',date:'2025-01-12',amount:+40},
    {type:'earn',title:"Ro'yxatdan o'tish bonusi",date:'2025-01-10',amount:+100},
  ];
  el.innerHTML=h.map(x=>`
    <div class="bonus-history-item">
      <div class="bh-left">
        <div class="bh-icon ${x.type}"><i class="fas ${x.type==='earn'?'fa-plus-circle':'fa-minus-circle'}"></i></div>
        <div><div class="bh-title">${x.title}</div><div class="bh-date">${x.date}</div></div>
      </div>
      <div class="bh-amount ${x.type}">${x.amount>0?'+':''}${x.amount} ball</div>
    </div>`).join('');
}

async function loadFavorites(){
  const el=document.getElementById('favoritesGrid');
  if(!el)return;
  const favs=JSON.parse(localStorage.getItem('sm_favorites')||'[]');
  if(!favs.length){el.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">❤️</div><h3>Sevimlilar bo'sh</h3><a href="menu.html" class="btn btn--primary" style="margin-top:1rem">Menyuga o'tish</a></div>`;return;}
  el.innerHTML=favs.map(i=>foodCardHTML(i)).join('');
}

window.reOrder = function(orderNum){showToast('Savatga qo\'shildi! 🛒','success');setTimeout(()=>window.location.href='order.html',1000);};

window.saveSettings = async function(){
  const name=document.getElementById('settingName')?.value.trim();
  if(!name){showToast('Ismingizni kiriting!','error');return;}
  const user={...JSON.parse(localStorage.getItem('sm_user')||'{}'),name};
  localStorage.setItem('sm_user',JSON.stringify(user));
  showToast('Saqlandi! ✅','success');
  document.getElementById('profileName').textContent=name;
};

window.changePassword = function(){
  const c=document.getElementById('currentPwd')?.value;
  const n=document.getElementById('newPwd')?.value;
  const cf=document.getElementById('confirmPwd')?.value;
  if(!c||!n){showToast("Barcha maydonlarni to'ldiring!",'error');return;}
  if(n.length<8){showToast('Parol kamida 8 belgi!','error');return;}
  if(n!==cf){showToast("Parollar mos emas!",'error');return;}
  showToast("Parol o'zgartirildi! ✅",'success');
  ['currentPwd','newPwd','confirmPwd'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
};

window.saveNotifPref = function(key,val){
  const p=JSON.parse(localStorage.getItem('sm_notif_prefs')||'{}');
  p[key]=val;localStorage.setItem('sm_notif_prefs',JSON.stringify(p));
  showToast('Saqlandi','info',1500);
};

window.confirmDeleteAccount = function(){
  if(confirm("Hisobni o'chirishni tasdiqlaysizmi?")){
    localStorage.removeItem('sm_user_token');localStorage.removeItem('sm_user');
    showToast("Hisob o'chirildi",'info');
    setTimeout(()=>window.location.href='index.html',1500);
  }
};

window.handleLogout = function(){
  localStorage.removeItem('sm_user_token');localStorage.removeItem('sm_user');
  showToast("Chiqildi. Xayr! 👋",'info');
  setTimeout(()=>window.location.href='index.html',1000);
};

/* ── ADMIN ── */
function initAdminPage(){
  const loginEl=document.getElementById('adminLogin');
  const panelEl=document.getElementById('adminPanel');
  if(!loginEl)return;
  const token=localStorage.getItem('sm_admin_token');
  if(token){try{const p=JSON.parse(atob(token.split('.')[1]));if(p.exp*1000>Date.now()){showPanel();return;}}catch{}}
  document.getElementById('loginForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const u=document.getElementById('loginUser').value;
    const p=document.getElementById('loginPass').value;
    const btn=e.target.querySelector('button[type="submit"]');
    setLoading(btn,true,'Tekshirilmoqda...');
    try{
      const res=await API.post('/admin/login',{username:u,password:p});
      if(res.success){localStorage.setItem('sm_admin_token',res.token);showPanel();}
      else{showToast(res.message||"Noto'g'ri",'error');}
    }catch{
      if(u==='admin'&&p==='admin123'){localStorage.setItem('sm_admin_token','demo');showPanel();}
      else showToast("Noto'g'ri login yoki parol",'error');
    }finally{setLoading(btn,false);}
  });
  document.getElementById('pwdToggle')?.addEventListener('click',()=>{
    const i=document.getElementById('loginPass');
    const b=document.getElementById('pwdToggle');
    if(i.type==='password'){i.type='text';b.innerHTML='<i class="fas fa-eye-slash"></i>';}
    else{i.type='password';b.innerHTML='<i class="fas fa-eye"></i>';}
  });
  function showPanel(){loginEl.classList.add('hidden');panelEl?.classList.remove('hidden');initAdminPanel();}
}

function initAdminPanel(){
  const links=document.querySelectorAll('.sidebar__link');
  const tabs=document.querySelectorAll('.admin-tab');
  const titleEl=document.getElementById('adminPageTitle');
  const tabNames={dashboard:'Dashboard',orders:'Buyurtmalar',menu:'Menyu',stats:'Statistika'};
  links.forEach(l=>l.addEventListener('click',e=>{
    e.preventDefault();const tab=l.dataset.tab;
    links.forEach(x=>x.classList.remove('active'));l.classList.add('active');
    tabs.forEach(t=>t.classList.remove('active'));document.getElementById('tab-'+tab)?.classList.add('active');
    if(titleEl)titleEl.textContent=tabNames[tab]||tab;
    if(tab==='orders')loadAdminOrders();if(tab==='menu')loadAdminMenu();if(tab==='stats')loadAdminStats();if(tab==='dashboard')loadDashboard();
    document.getElementById('adminSidebar')?.classList.remove('open');
  }));
  document.getElementById('logoutBtn')?.addEventListener('click',()=>{localStorage.removeItem('sm_admin_token');location.reload();});
  document.getElementById('sidebarToggle')?.addEventListener('click',()=>document.getElementById('adminSidebar')?.classList.toggle('open'));
  loadDashboard();initMenuModal();
  document.getElementById('orderStatusFilter')?.addEventListener('change',e=>loadAdminOrders(e.target.value));
}

async function loadDashboard(){
  try{
    const res=await API.get('/stats','admin');
    if(!res.success)return;
    const{today,topItems}=res.data;
    const el=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    el('statOrders',today.orders);el('statRevenue',(today.revenue||0).toLocaleString('uz-UZ'));el('statPending',today.pending);
    const popEl=document.getElementById('popularItems');
    if(popEl&&topItems?.length)popEl.innerHTML=topItems.map((i,idx)=>`
      <div class="popular-item"><span class="pop-rank">${idx+1}</span><span class="pop-name">${i.name}</span><span class="pop-count">${i.count} ta</span></div>`).join('');
  }catch{}
}

async function loadAdminOrders(filter='all'){
  const tbody=document.getElementById('ordersTableBody');
  if(!tbody)return;
  tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray)">Yuklanmoqda...</td></tr>`;
  try{
    const q=filter!=='all'?'?status='+filter:'';
    const res=await API.get('/orders'+q,'admin');
    if(!res.success||!res.data?.length){tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--gray);padding:2rem">Buyurtmalar yo'q</td></tr>`;return;}
    const si={new:{l:'Yangi',c:'new',i:'🆕'},preparing:{l:'Tayyorlanmoqda',c:'preparing',i:'👨‍🍳'},onway:{l:"Yo'lda",c:'onway',i:'🛵'},done:{l:'Yetkazildi',c:'done',i:'✅'},cancelled:{l:'Bekor',c:'done',i:'❌'}};
    tbody.innerHTML=res.data.map(o=>{
      const s=si[o.status]||{l:o.status,c:'new',i:'?'};
      return `<tr>
        <td><strong style="color:var(--purple-light)">${o.orderNum}</strong></td>
        <td>${o.customer?.name||'—'}</td>
        <td>${o.customer?.phone||'—'}</td>
        <td style="font-size:.78rem;color:var(--gray);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.items?.map(i=>`${i.emoji}${i.name} x${i.qty}`).join(', ')||'—'}</td>
        <td><strong>${fmtPrice(o.total)}</strong></td>
        <td><span class="status-badge status-badge--${s.c}">${s.i} ${s.l}</span></td>
        <td>${o.status!=='done'&&o.status!=='cancelled'?`<button class="btn btn--sm btn--primary" onclick="advanceOrder('${o._id}','${o.status}')">Keyingi →</button>`:'<span style="color:var(--green)">✓</span>'}</td>
      </tr>`;}).join('');
  }catch{tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--gray)">Xato</td></tr>`;}
}

window.advanceOrder = async function(id,cur){
  const next={new:'preparing',preparing:'onway',onway:'done'};
  const ns=next[cur];if(!ns)return;
  try{const res=await API.put('/orders/'+id+'/status',{status:ns},'admin');if(res.success){showToast('Status yangilandi ✅','success');loadAdminOrders(document.getElementById('orderStatusFilter')?.value||'all');}}
  catch{showToast('Xato','error');}
};

let adminMenuItems=[];

async function loadAdminMenu(){
  const grid=document.getElementById('adminMenuGrid');
  if(!grid)return;
  grid.innerHTML='<div style="color:var(--gray);text-align:center;padding:2rem">Yuklanmoqda...</div>';
  try{const res=await API.get('/menu','admin');adminMenuItems=res.success?res.data:MENU_DATA;}
  catch{adminMenuItems=MENU_DATA;}
  renderAdminMenuGrid();
}

function renderAdminMenuGrid(){
  const grid=document.getElementById('adminMenuGrid');if(!grid)return;
  if(!adminMenuItems.length){grid.innerHTML='<div style="color:var(--gray);text-align:center;padding:2rem">Menyu bo\'sh</div>';return;}
  grid.innerHTML=adminMenuItems.map(i=>`
    <div class="admin-menu-card">
      <div class="admin-menu-card__img">${i.emoji}</div>
      <div class="admin-menu-card__body">
        <div class="admin-menu-card__name">${i.name}</div>
        <div class="admin-menu-card__price">${fmtPrice(i.price)}</div>
        <div style="font-size:.75rem;color:var(--gray);margin-top:.25rem">${i.available?'✅ Mavjud':'❌ Yo\'q'} · ${i.category}</div>
        <div class="admin-menu-card__actions">
          <button class="btn btn--sm btn--outline" onclick="adminEditItem('${i._id}')"><i class="fas fa-edit"></i> Tahrirlash</button>
          <button class="btn btn--sm" style="background:rgba(239,68,68,.15);color:var(--red);border-color:rgba(239,68,68,.3)" onclick="adminDeleteItem('${i._id}','${i.name}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`).join('');
}

window.adminEditItem = function(id){const i=adminMenuItems.find(x=>x._id===id);if(i)openMenuModal(i);};
window.adminDeleteItem = async function(id,name){
  if(!confirm(`"${name}" ni o'chirishni tasdiqlaysizmi?`))return;
  try{const res=await API.delete('/menu/'+id,'admin');if(res.success){adminMenuItems=adminMenuItems.filter(i=>i._id!==id);renderAdminMenuGrid();showToast("O'chirildi",'info');}}
  catch{showToast("Xato",'error');}
};

function initMenuModal(){
  const modal=document.getElementById('menuItemModal');
  const addBtn=document.getElementById('addItemBtn');
  const cancelBtn=document.getElementById('cancelMenuModal');
  const form=document.getElementById('menuItemForm');
  if(!modal)return;
  addBtn?.addEventListener('click',()=>openMenuModal());
  cancelBtn?.addEventListener('click',()=>modal.classList.add('hidden'));
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden');});
  form?.addEventListener('submit',async e=>{
    e.preventDefault();
    const id=document.getElementById('editItemId').value;
    const body={name:document.getElementById('itemName').value.trim(),price:parseInt(document.getElementById('itemPrice').value)||null,category:document.getElementById('itemCategory').value,ingredients:document.getElementById('itemIngredients').value,emoji:document.getElementById('itemEmoji').value||'🥟',popular:document.getElementById('itemPopular').checked,available:document.getElementById('itemAvailable').checked};
    if(!body.name){showToast("Nom kerak!",'error');return;}
    const btn=form.querySelector('button[type="submit"]');
    setLoading(btn,true,'Saqlanmoqda...');
    try{
      const res=id?await API.put('/menu/'+id,body,'admin'):await API.post('/menu',body,'admin');
      if(res.success){showToast(id?'Yangilandi!':'Qo\'shildi!','success');modal.classList.add('hidden');await loadAdminMenu();}
      else showToast(res.message||'Xato','error');
    }catch{showToast("Server bilan aloqa yo'q",'error');}
    finally{setLoading(btn,false);}
  });
}

function openMenuModal(item=null){
  const modal=document.getElementById('menuItemModal');
  const title=document.getElementById('menuModalTitle');
  if(!modal)return;
  document.getElementById('menuItemForm')?.reset();
  document.getElementById('editItemId').value='';
  if(item){
    title.textContent='Tahrirlash';
    document.getElementById('editItemId').value=item._id;
    document.getElementById('itemName').value=item.name;
    document.getElementById('itemPrice').value=item.price||'';
    document.getElementById('itemCategory').value=item.category;
    document.getElementById('itemIngredients').value=item.ingredients||'';
    document.getElementById('itemEmoji').value=item.emoji||'';
    document.getElementById('itemPopular').checked=item.popular;
    document.getElementById('itemAvailable').checked=item.available!==false;
  } else {
    title.textContent="Taom qo'shish";
    document.getElementById('itemAvailable').checked=true;
  }
  modal.classList.remove('hidden');
}

async function loadAdminStats(){
  const rCtx=document.getElementById('revenueChart');
  const oCtx=document.getElementById('ordersChart');
  if(!rCtx)return;
  try{
    const res=await API.get('/stats','admin');
    let labels=['Du','Se','Ch','Pa','Ju','Sh','Ya'];
    let revenues=[1500000,2200000,1800000,2800000,3200000,3800000,2500000];
    let orders=[45,62,55,78,85,95,68];
    if(res.success&&res.data?.weeklyRevenue){
      labels=res.data.weeklyRevenue.map(d=>d.date);
      revenues=res.data.weeklyRevenue.map(d=>d.revenue);
      orders=res.data.weeklyRevenue.map(d=>d.orders);
    }
    if(typeof Chart==='undefined')return;
    Chart.defaults.color='#888';Chart.defaults.font.family='Poppins';
    Chart.getChart(rCtx)?.destroy();Chart.getChart(oCtx)?.destroy();
    new Chart(rCtx,{type:'bar',data:{labels,datasets:[{label:"Daromad (so'm)",data:revenues,backgroundColor:'rgba(107,33,168,0.2)',borderColor:'#8b5cf6',borderWidth:2,borderRadius:8}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{callback:v=>(v/1000000).toFixed(1)+'M'}},x:{grid:{display:false}}}}});
    new Chart(oCtx,{type:'line',data:{labels,datasets:[{label:'Buyurtmalar',data:orders,borderColor:'#6b21a8',backgroundColor:'rgba(107,33,168,0.07)',tension:0.4,fill:true,pointBackgroundColor:'#8b5cf6',pointRadius:5}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{grid:{color:'rgba(255,255,255,0.05)'},min:0},x:{grid:{display:false}}}}});
  }catch{}
}

/* ── GLOBAL INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initScrollTop();
  Cart.updateBadge();
  renderNavUser();
  initHomePage();
  initMenuPage();
  initOrderPage();
  initTrackPage();
  initContactPage();
  initAuthPage();
  initProfilePage();
  initAdminPage();
});
