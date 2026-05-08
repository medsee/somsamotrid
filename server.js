require('dotenv').config();
const express=require('express'),mongoose=require('mongoose'),cors=require('cors'),helmet=require('helmet'),compression=require('compression'),morgan=require('morgan'),rateLimit=require('express-rate-limit'),path=require('path'),jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs');
const app=express(),PORT=process.env.PORT||3000,JWT_SECRET=process.env.JWT_SECRET||'somsa_motrid_secret';
app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
app.use(compression());
app.use(cors({origin:process.env.NODE_ENV==='production'?[process.env.APP_URL,'https://medsee.github.io',/\.github\.io$/]:'*',credentials:true}));
app.use(express.json({limit:'10kb'}));
app.use(express.urlencoded({extended:true}));
app.use(morgan(process.env.NODE_ENV==='production'?'combined':'dev'));
app.use('/api/',rateLimit({windowMs:15*60*1000,max:200,message:{success:false,message:"Juda ko'p so'rov"}}));
app.use(express.static(path.join(__dirname),{maxAge:'1d'}));

const MONGO_URI=process.env.MONGO_URL||process.env.MONGO_URI||'mongodb://localhost:27017/somsa_motrid';
async function connectDB(){try{await mongoose.connect(MONGO_URI);console.log('✅ MongoDB:',mongoose.connection.host);await seed();}catch(e){console.error('❌ MongoDB:',e.message);}}

// MODELS
const MenuItem=mongoose.model('MenuItem',new mongoose.Schema({name:{type:String,required:true,trim:true},category:{type:String,required:true,enum:['somsa','bichak','fatir','other']},price:{type:Number,default:null},emoji:{type:String,default:'🥟'},ingredients:{type:String,default:''},popular:{type:Boolean,default:false},available:{type:Boolean,default:true},sortOrder:{type:Number,default:0}},{timestamps:true}));

const OI=new mongoose.Schema({menuItemId:mongoose.Schema.Types.ObjectId,name:String,price:Number,emoji:String,qty:{type:Number,min:1}},{_id:false});
const oSchema=new mongoose.Schema({orderNum:{type:String,unique:true},customer:{name:String,phone:String,address:{type:String,default:''},note:{type:String,default:''}},items:[OI],deliveryType:{type:String,enum:['delivery','pickup'],default:'delivery'},deliveryFee:{type:Number,default:5000},subtotal:Number,total:Number,status:{type:String,enum:['new','preparing','onway','done','cancelled'],default:'new'},statusStep:{type:Number,default:1},eta:{type:String,default:'20-30 daqiqa'},paymentType:{type:String,enum:['cash','card','click','payme'],default:'cash'},paymentStatus:{type:String,enum:['pending','paid','cancelled'],default:'pending'},isPaid:{type:Boolean,default:false},paidAt:Date,clickTransId:String,paymeTransId:String},{timestamps:true});
oSchema.pre('save',async function(n){if(!this.orderNum){const c=await Order.countDocuments().catch(()=>0);this.orderNum='#'+String(1000+c+1).padStart(4,'0');}n();});
const Order=mongoose.model('Order',oSchema);
const PaymeTx=mongoose.model('PaymeTx',new mongoose.Schema({paymeId:{type:String,unique:true},orderId:{type:mongoose.Schema.Types.ObjectId,ref:'Order'},amount:Number,state:{type:Number,default:1},createTime:Number,performTime:Number,cancelTime:Number,reason:Number},{timestamps:true}));
const Admin=mongoose.model('Admin',new mongoose.Schema({username:{type:String,unique:true},password:String,role:{type:String,default:'admin'},lastLoginAt:Date},{timestamps:true}));
const LEVELS=[{name:"Boshlang'ich",min:0},{name:'Kumush',min:500},{name:'Oltin',min:1000},{name:'Platinum',min:2000},{name:'VIP',min:5000}];
function getLevel(p){let l=LEVELS[0];for(const x of LEVELS){if(p>=x.min)l=x;}return l;}
const uSchema=new mongoose.Schema({name:{type:String,required:true},phone:{type:String,required:true,unique:true},email:{type:String,unique:true,sparse:true,lowercase:true},password:{type:String,required:true,select:false},defaultAddress:{type:String,default:''},bonusPoints:{type:Number,default:0},favorites:[{type:mongoose.Schema.Types.ObjectId,ref:'MenuItem'}],totalOrders:{type:Number,default:0},totalSpent:{type:Number,default:0},bonusHistory:[{type:{type:String,enum:['earn','spend']},amount:Number,reason:String,date:{type:Date,default:Date.now}}],isActive:{type:Boolean,default:true},lastLoginAt:Date},{timestamps:true});
uSchema.methods.toPublic=function(){const o=this.toObject();delete o.password;delete o.__v;o.level=getLevel(o.bonusPoints);o.favoritesCount=o.favorites?.length||0;return o;};
uSchema.methods.addBH=function(type,amount,reason){this.bonusHistory.push({type,amount,reason});if(this.bonusHistory.length>100)this.bonusHistory=this.bonusHistory.slice(-100);};
const User=mongoose.model('User',uSchema);

// TELEGRAM
let bot=null;
function setupTG(){const t=process.env.TELEGRAM_BOT_TOKEN;if(!t)return;try{const B=require('node-telegram-bot-api');bot=new B(t,{polling:false});console.log('✅ Telegram');}catch(e){console.error('TG:',e.message);}}
async function notify(o){if(!bot||!process.env.TELEGRAM_CHAT_ID)return;const items=o.items.map(i=>`  ${i.emoji} ${i.name} x${i.qty}`).join('\n');const pay={cash:'💵 Naqd',card:'💳 Karta',click:'🔵 Click',payme:'🟢 Payme'}[o.paymentType]||'💵';try{await bot.sendMessage(process.env.TELEGRAM_CHAT_ID,`🔔 *YANGI BUYURTMA ${o.orderNum}*\n\n👤 ${o.customer.name}\n📞 ${o.customer.phone}\n📍 ${o.deliveryType==='pickup'?"O'zi oladi":o.customer.address}\n\n*Taomlar:*\n${items}\n\n💰 *${o.total.toLocaleString()} so'm*\n${pay}`,{parse_mode:'Markdown'});}catch(e){console.error('TG:',e.message);}}

// AUTH
function aAuth(req,res,next){const t=(req.headers.authorization||'').split(' ')[1];if(!t)return res.status(401).json({success:false,message:'Token kerak'});try{req.admin=jwt.verify(t,JWT_SECRET);next();}catch{res.status(401).json({success:false,message:'Token yaroqsiz'});}}
function uAuth(req,res,next){const t=(req.headers.authorization||'').split(' ')[1];if(!t)return res.status(401).json({success:false,message:'Token kerak'});try{req.user=jwt.verify(t,JWT_SECRET);next();}catch{res.status(401).json({success:false,message:'Token yaroqsiz'});}}

// PAYMENTS
const cR=require('express').Router(),pR=require('express').Router();
require('./payments/click')(cR,Order);
require('./payments/payme')(pR,Order,PaymeTx);
app.use('/api/payment/click',cR);
app.use('/api/payment/payme',pR);

// HEALTH
app.get('/api/health',(req,res)=>res.json({success:true,status:'ok',service:'Somsa.uz Motrid API v1.0',db:mongoose.connection.readyState===1?'connected':'disconnected',payments:{click:!!process.env.CLICK_MERCHANT_ID,payme:!!process.env.PAYME_MERCHANT_ID},telegram:!!bot,uptime:Math.floor(process.uptime())+'s'}));
app.get('/api',(req,res)=>res.json({success:true,message:'🥟 Somsa.uz Motrid API v1.0'}));

// MENU
app.get('/api/menu',async(req,res)=>{try{const{category,popular,available,search}=req.query,f={};if(category&&category!=='all')f.category=category;if(popular==='true')f.popular=true;if(available==='true')f.available=true;if(search)f.$or=[{name:{$regex:search,$options:'i'}},{ingredients:{$regex:search,$options:'i'}}];const items=await MenuItem.find(f).sort({sortOrder:1}).lean();res.json({success:true,count:items.length,data:items});}catch(e){res.status(500).json({success:false,message:e.message});}});
app.post('/api/menu',aAuth,async(req,res)=>{try{if(!req.body.name||!req.body.category)return res.status(400).json({success:false,message:'Nom va kategoriya kerak'});const item=await MenuItem.create(req.body);res.status(201).json({success:true,data:item});}catch(e){res.status(500).json({success:false,message:e.message});}});
app.put('/api/menu/:id',aAuth,async(req,res)=>{try{const item=await MenuItem.findByIdAndUpdate(req.params.id,req.body,{new:true});if(!item)return res.status(404).json({success:false,message:'Topilmadi'});res.json({success:true,data:item});}catch(e){res.status(500).json({success:false,message:e.message});}});
app.delete('/api/menu/:id',aAuth,async(req,res)=>{try{await MenuItem.findByIdAndDelete(req.params.id);res.json({success:true,message:"O'chirildi"});}catch(e){res.status(500).json({success:false,message:e.message});}});

// ORDERS
app.post('/api/orders',rateLimit({windowMs:60*1000,max:10}),async(req,res)=>{try{const{customer,items,deliveryType,paymentType}=req.body;if(!customer?.name?.trim())return res.status(400).json({success:false,message:'Ism kerak'});if(!customer?.phone?.trim())return res.status(400).json({success:false,message:'Telefon kerak'});if(!items?.length)return res.status(400).json({success:false,message:"Savat bo'sh"});if(deliveryType==='delivery'&&!customer?.address?.trim())return res.status(400).json({success:false,message:'Manzil kerak'});const vi=[];let sub=0;for(const oi of items){const db=oi.menuItemId?await MenuItem.findById(oi.menuItemId).lean():await MenuItem.findOne({name:oi.name}).lean();if(!db)return res.status(400).json({success:false,message:`"${oi.name}" topilmadi`});if(!db.available)return res.status(400).json({success:false,message:`"${db.name}" mavjud emas`});const qty=Math.max(1,Math.min(99,parseInt(oi.qty)||1));vi.push({menuItemId:db._id,name:db.name,price:db.price||0,emoji:db.emoji,qty});sub+=(db.price||0)*qty;}const fee=deliveryType==='delivery'?5000:0,total=sub+fee,pt=['cash','card','click','payme'].includes(paymentType)?paymentType:'cash';const order=await Order.create({customer:{name:customer.name.trim(),phone:customer.phone.trim(),address:customer.address?.trim()||'',note:customer.note?.trim()||''},items:vi,deliveryType:deliveryType||'delivery',deliveryFee:fee,subtotal:sub,total,paymentType:pt,paymentStatus:'pending',isPaid:false});await notify(order);try{const bon=Math.floor(total/1000);if(bon>0){const u=await User.findOne({phone:customer.phone.trim()});if(u){u.bonusPoints+=bon;u.totalOrders=(u.totalOrders||0)+1;u.totalSpent=(u.totalSpent||0)+total;u.addBH('earn',bon,`Buyurtma ${order.orderNum}`);await u.save();}}}catch{}res.status(201).json({success:true,message:'Buyurtma qabul qilindi!',data:{_id:order._id,orderNum:order.orderNum,total:order.total,status:order.status,paymentType:order.paymentType,eta:order.eta}});}catch(e){console.error('Order:',e);res.status(500).json({success:false,message:e.message});}});
app.get('/api/orders/:num',async(req,res)=>{try{let n=req.params.num;if(!n.startsWith('#'))n='#'+n;const o=await Order.findOne({orderNum:n}).lean();if(!o)return res.status(404).json({success:false,message:'Topilmadi'});const L={new:{label:'Qabul qilindi',step:1},preparing:{label:'Tayyorlanmoqda',step:2},onway:{label:"Yo'lda",step:3},done:{label:'Yetkazildi',step:4},cancelled:{label:'Bekor',step:0}};res.json({success:true,data:{...o,statusLabel:L[o.status]?.label,step:L[o.status]?.step||1,customer:{name:o.customer.name}}});}catch(e){res.status(500).json({success:false,message:e.message});}});
app.get('/api/orders',aAuth,async(req,res)=>{try{const{status,page=1,limit=30}=req.query,f={};if(status&&status!=='all')f.status=status;const skip=(parseInt(page)-1)*parseInt(limit),[total,orders]=await Promise.all([Order.countDocuments(f),Order.find(f).sort({createdAt:-1}).skip(skip).limit(parseInt(limit)).lean()]);const today=new Date();today.setHours(0,0,0,0);const td=await Order.find({createdAt:{$gte:today}}).lean();res.json({success:true,total,page:parseInt(page),pages:Math.ceil(total/parseInt(limit)),stats:{todayOrders:td.length,todayRevenue:td.reduce((s,o)=>s+o.total,0),pending:td.filter(o=>!['done','cancelled'].includes(o.status)).length},data:orders});}catch(e){res.status(500).json({success:false,message:e.message});}});
app.put('/api/orders/:id/status',aAuth,async(req,res)=>{try{const{status}=req.body,sm={new:1,preparing:2,onway:3,done:4,cancelled:0};if(!Object.keys(sm).includes(status))return res.status(400).json({success:false,message:'Noto\'g\'ri status'});const o=await Order.findByIdAndUpdate(req.params.id,{status,statusStep:sm[status]},{new:true});if(!o)return res.status(404).json({success:false,message:'Topilmadi'});res.json({success:true,data:{status:o.status,orderNum:o.orderNum}});}catch(e){res.status(500).json({success:false,message:e.message});}});

// ADMIN AUTH
app.post('/api/admin/login',async(req,res)=>{try{const{username,password}=req.body;if(!username||!password)return res.status(400).json({success:false,message:'Login va parol kerak'});let ok=false;if(mongoose.connection.readyState===1){const a=await Admin.findOne({username});if(a){ok=await bcrypt.compare(password,a.password);if(ok)await Admin.findByIdAndUpdate(a._id,{lastLoginAt:new Date()});}}else{ok=username==='admin'&&password==='admin123';}if(!ok)return res.status(401).json({success:false,message:"Noto'g'ri"});const token=jwt.sign({username,role:'admin'},JWT_SECRET,{expiresIn:'24h'});res.json({success:true,token,expiresIn:'24h'});}catch(e){res.status(500).json({success:false,message:e.message});}});

// USERS
app.post('/api/users/register',async(req,res)=>{try{const{name,phone,email,password}=req.body;if(!name||!phone||!password)return res.status(400).json({success:false,message:'Ism, telefon, parol kerak'});if(password.length<8)return res.status(400).json({success:false,message:'Parol kamida 8 belgi'});const ex=await User.findOne({$or:[{phone},...(email?[{email}]:[])]});if(ex)return res.status(409).json({success:false,message:"Bu telefon allaqachon ro'yxatdan o'tgan"});const h=await bcrypt.hash(password,12);const u=new User({name:name.trim(),phone:phone.trim(),email:email?.trim()||undefined,password:h,bonusPoints:100});u.addBH('earn',100,"Ro'yxatdan o'tish bonusi");await u.save();const token=jwt.sign({id:u._id,role:'user'},JWT_SECRET,{expiresIn:'30d'});res.status(201).json({success:true,message:'Muvaffaqiyatli! 100 ball.',token,user:u.toPublic()});}catch(e){if(e.code===11000)return res.status(409).json({success:false,message:"Allaqachon mavjud"});res.status(500).json({success:false,message:e.message});}});
app.post('/api/users/login',async(req,res)=>{try{const{identifier,password}=req.body;if(!identifier||!password)return res.status(400).json({success:false,message:'Login va parol kerak'});const u=await User.findOne({$or:[{phone:identifier},{email:identifier}]}).select('+password');if(!u)return res.status(401).json({success:false,message:'Topilmadi'});const m=await bcrypt.compare(password,u.password);if(!m)return res.status(401).json({success:false,message:"Noto'g'ri parol"});u.lastLoginAt=new Date();await u.save();const token=jwt.sign({id:u._id,role:'user'},JWT_SECRET,{expiresIn:'30d'});res.json({success:true,message:`Xush kelibsiz, ${u.name}!`,token,user:u.toPublic()});}catch(e){res.status(500).json({success:false,message:e.message});}});
app.get('/api/users/me',uAuth,async(req,res)=>{try{const u=await User.findById(req.user.id);if(!u)return res.status(404).json({success:false,message:'Topilmadi'});res.json({success:true,data:u.toPublic()});}catch(e){res.status(500).json({success:false,message:e.message});}});
app.put('/api/users/profile',uAuth,async(req,res)=>{try{const u=await User.findByIdAndUpdate(req.user.id,{name:req.body.name,email:req.body.email,defaultAddress:req.body.address},{new:true});res.json({success:true,data:u?.toPublic()});}catch(e){res.status(500).json({success:false,message:e.message});}});
app.get('/api/users/orders',uAuth,async(req,res)=>{try{const u=await User.findById(req.user.id);if(!u)return res.status(404).json({success:false,message:'Topilmadi'});const orders=await Order.find({'customer.phone':u.phone}).sort({createdAt:-1}).limit(50).lean();res.json({success:true,count:orders.length,data:orders});}catch(e){res.status(500).json({success:false,message:e.message});}});
app.get('/api/users/bonus-history',uAuth,async(req,res)=>{try{const u=await User.findById(req.user.id);if(!u)return res.status(404).json({success:false,message:'Topilmadi'});res.json({success:true,data:{currentPoints:u.bonusPoints,level:getLevel(u.bonusPoints),history:u.bonusHistory?.slice(-50).reverse()||[]}});}catch(e){res.status(500).json({success:false,message:e.message});}});

// STATS
app.get('/api/stats',aAuth,async(req,res)=>{try{const today=new Date();today.setHours(0,0,0,0);const wa=new Date(today);wa.setDate(wa.getDate()-7);const[td,wd,tc]=await Promise.all([Order.find({createdAt:{$gte:today}}).lean(),Order.find({createdAt:{$gte:wa}}).lean(),Order.countDocuments()]);const wr=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);d.setHours(0,0,0,0);const nx=new Date(d);nx.setDate(nx.getDate()+1);const do2=wd.filter(o=>new Date(o.createdAt)>=d&&new Date(o.createdAt)<nx);wr.push({date:d.toLocaleDateString('uz-UZ',{weekday:'short'}),revenue:do2.reduce((s,o)=>s+o.total,0),orders:do2.length});}const all=await Order.find({status:{$ne:'cancelled'}}).lean();const ic={};all.forEach(o=>o.items.forEach(i=>{ic[i.name]=(ic[i.name]||0)+i.qty;}));const ti=Object.entries(ic).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>({name,count}));res.json({success:true,data:{today:{orders:td.length,revenue:td.reduce((s,o)=>s+o.total,0),pending:td.filter(o=>!['done','cancelled'].includes(o.status)).length},weekly:{orders:wd.length,revenue:wd.reduce((s,o)=>s+o.total,0)},total:{orders:tc},weeklyRevenue:wr,topItems:ti}});}catch(e){res.status(500).json({success:false,message:e.message});}});

// PAGES
['menu','order','track','admin','contact','auth','profile'].forEach(p=>app.get('/'+p,(req,res)=>res.sendFile(path.join(__dirname,p+'.html'))));
app.use((req,res)=>{if(req.path.startsWith('/api'))return res.status(404).json({success:false,message:'Topilmadi'});res.sendFile(path.join(__dirname,'index.html'));});
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({success:false,message:'Server xatosi'});});

// SEED
async function seed(){const[mc,ac]=await Promise.all([MenuItem.countDocuments(),Admin.countDocuments()]);
if(mc===0){await MenuItem.insertMany([
  {name:'Shakarli Somsa',category:'somsa',price:8000,emoji:'🥟',ingredients:"Xamir, shakar, yog'",popular:true,available:true,sortOrder:1},
  {name:'Tandir Somsa',category:'somsa',price:10000,emoji:'🥟',ingredients:"Go'sht, piyoz, ziravorlar — tandirda",popular:true,available:true,sortOrder:2},
  {name:'Kuyovli Somsa',category:'somsa',price:40000,emoji:'🥟',ingredients:"Maxsus go'sht, ziravorlar — bayramona",popular:true,available:true,sortOrder:3},
  {name:'Shokoladli Somsa',category:'somsa',price:10000,emoji:'🍫',ingredients:"Shokolad, yong'oq",popular:true,available:true,sortOrder:4},
  {name:'Julen Somsa',category:'somsa',price:20000,emoji:'🥟',ingredients:"Tovuq, qo'ziqorin, krem sous",popular:false,available:true,sortOrder:5},
  {name:'Tomchi Somsa',category:'somsa',price:7000,emoji:'🥟',ingredients:"Go'sht, piyoz — tomchi shaklida",popular:false,available:true,sortOrder:6},
  {name:'Qiyma Somsa',category:'somsa',price:7000,emoji:'🥟',ingredients:"Qiyma go'sht, piyoz",popular:false,available:true,sortOrder:7},
  {name:'Konus Somsa',category:'somsa',price:7000,emoji:'🥟',ingredients:"Go'sht, piyoz — konus",popular:false,available:true,sortOrder:8},
  {name:"O'tli Bichak",category:'bichak',price:5000,emoji:'🥬',ingredients:"Ko'k o't, piyoz",popular:false,available:true,sortOrder:9},
  {name:'Qovoqli Bichak',category:'bichak',price:5000,emoji:'🎃',ingredients:"Qovoq, piyoz",popular:false,available:true,sortOrder:10},
  {name:'Qovurilgan Bichak',category:'bichak',price:6000,emoji:'🥘',ingredients:"Go'sht, piyoz — qovurilgan",popular:false,available:true,sortOrder:11},
  {name:'Fatir',category:'fatir',price:25000,emoji:'🫓',ingredients:"Un, yog' — katta fatir",popular:true,available:true,sortOrder:12},
  {name:'Kesilgan Fatir',category:'fatir',price:15000,emoji:'🫓',ingredients:"Fatir, kesilgan",popular:false,available:true,sortOrder:13},
  {name:'Mini Fatir',category:'fatir',price:6000,emoji:'🫓',ingredients:"Kichik fatir",popular:false,available:true,sortOrder:14},
  {name:"Bo'g'irsoq",category:'other',price:null,emoji:'🍩',ingredients:"Qovurilgan xamir",popular:false,available:true,sortOrder:15},
]);console.log("✅ Menyu: 15 ta somsa va boshqalar");}
if(ac===0){const h=await bcrypt.hash('admin123',12);await Admin.create({username:'admin',password:h,role:'superadmin'});console.log('✅ Admin: admin/admin123');}
}

async function start(){await connectDB();setupTG();app.listen(PORT,()=>{console.log(`\n  🥟 SOMSA.UZ MOTRID v1.0 → http://localhost:${PORT}\n  💳 Click: ${process.env.CLICK_MERCHANT_ID?'✅':'⚠️ sozlanmagan'}\n  📱 Telegram: ${process.env.TELEGRAM_BOT_TOKEN?'✅':'⚠️ sozlanmagan'}\n`);});}
process.on('SIGTERM',async()=>{await mongoose.disconnect();process.exit(0);});
start();module.exports=app;
