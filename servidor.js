// 1. CARGA DE VARIABLES DE ENTORNO
require('dotenv').config({ path: './credenciales.env' });

// 2. IMPORTACIÓN DE LIBRERÍAS
const express = require('express');
const twilio = require('twilio');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose'); // Usaremos Mongoose para la conexión y modelos

const app = express();

// ----------------------------------------------------
// 3. CONFIGURACIÓN DE MIDDLEWARE Y CONEXIÓN A DB
// ----------------------------------------------------

// 🚨 CONEXIÓN A MONGODB
// En Render, MONGO_URI debe ser la cadena de Atlas.
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/glam_app';
mongoose.connect(MONGO_URI)
    .then(() => console.log('Conexión a MongoDB OK'))
    .catch(err => console.error('Error conectando a MongoDB:', err.message || err));


// 🚨 DEFINICIÓN DE MODELOS (Esquemas de MongoDB/Mongoose)

// --- Modelo User ---
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true }, 
    name: { type: String, required: true },
    password: { type: String, required: true, select: false }, 
    picture_url: String,
    is_admin: { type: Boolean, default: false }, 
    created_at: { type: Date, default: Date.now } 
});
const User = mongoose.model('User', UserSchema);

// --- Modelo Product ---
const ProductSchema = new mongoose.Schema({
    id_sql: { type: String, required: true, unique: true }, 
    name: { type: String, required: true },
    price: { type: Number, required: true }, 
    description: String,
    image_url: String,
    video_id: String,
    stock: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true }
});
const Product = mongoose.model('Product', ProductSchema);


const VERCEL_FRONTEND = process.env.FRONTEND_URL;
const ALLOWED_ORIGINS = [
    'http://localhost:80',
    'http://localhost:3000',
    'http://127.0.0.1:80',
    'http://127.0.0.1:3000',
];

if (VERCEL_FRONTEND) {
    ALLOWED_ORIGINS.push(VERCEL_FRONTEND); 
}

app.use(cors({ 
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); 
        
        if (ALLOWED_ORIGINS.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1')) {
            callback(null, true);
        } else {
            console.error(`CORS Blocked: ${origin}. Origen no permitido.`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type']
}));

app.set('trust proxy', 1);
app.use(express.json()); 

app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,         
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000  
    }
}));

app.use(function(req, res, next) {
    try {
        console.log(new Date().toISOString(), req.method, req.url, 'Session:', req.session.userId || 'Guest');
    } catch (e) {
        console.warn('Error logging request', e);
    }
    next();
});

// DEFINICIÓN DE MIDDLEWARE DE AUTORIZACIÓN (se mantienen igual, usan req.session)
function requireAuth(req, res, next){
    if (req.session && req.session.userId) return next();
    return res.status(401).json({ message: 'No autenticado' });
}
const requireSession = requireAuth;
function requireAdmin(req, res, next){
    if (req.session && req.session.userId && req.session.isAdmin) return next();
    return res.status(403).json({ message: 'No autorizado. Se requiere acceso de administrador.' });
}

// ----------------------------------------------------------------------------------
// 🚨 CORRECCIÓN 1: ENDPOINT RAÍZ PARA EVITAR "Cannot GET /"
// ----------------------------------------------------------------------------------

app.get('/', (req, res) => {
    res.status(200).json({ 
        message: '✅ Glam App API está activa y conectada a MongoDB.',
        version: '1.0',
        check_endpoints: ['/api/products', '/api/login']
    });
});

// --- 4. ENDPOINT PARA EL ENVÍO DE SMS (Twilio) --- 
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER; 
const client = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.post('/enviar-sms', async (req, res) => {
    const { to, body } = req.body; 
    if (!to || !body) return res.status(400).json({ message: 'Faltan el número o el mensaje.' });
    try {
        if (process.env.TEST_MODE === '1' || process.env.TEST_MODE === 'true') {
             console.log('TEST_MODE active: simulando envío de SMS a', to);
             return res.json({ message: '✅ (TEST_MODE) SMS simulado con éxito.' });
        }
        await client.messages.create({ to: to, from: twilioPhoneNumber, body: body });
        res.json({ message: '✅ SMS enviado con éxito!' });
    } catch (error) {
        console.error("Error de Twilio (Revisar Credenciales/Número):", error); 
        res.status(500).json({ message: '❌ Error al comunicarse con Twilio. Revisa la terminal para detalles.' });
    }
});


// -------------------- API: Autenticación básica (ADAPTADA A MONGODB) --------------------

app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: 'Faltan campos.' });
    try {
        const hash = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            name, 
            email, 
            password: hash, 
            is_admin: false 
        });
        const result = await newUser.save(); 
        res.json({ id: result._id, name, email, message: 'Registro exitoso. Inicie sesión.' });
    } catch (err) {
        console.error('register error', err);
        if (err && err.code === 11000) return res.status(409).json({ message: 'Usuario ya existe' }); 
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

app.post('/api/login', async (req, res) => {
    console.log('*** ENDPOINT /api/login llamado ***');
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Faltan campos.' });
    try {
        const user = await User.findOne({ email }).select('+password');
        
        if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });
        
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
            console.log('Contraseña incorrecta para:', email);
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }
        
        console.log('LOGIN exitoso:', email, 'is_admin en BD:', user.is_admin);
        
        req.session.userId = user._id.toString();
        req.session.userName = user.name;
        req.session.isAdmin = user.is_admin; 
        
        console.log('Sesión guardada - userId:', user._id, 'userName:', user.name, 'isAdmin:', user.is_admin);
        
        const responseBody = { 
            id: user._id, 
            name: user.name, 
            email: user.email, 
            is_admin: user.is_admin
        };

        res.json(responseBody);
    } catch (err) {
        console.error('login error', err);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ message: 'No se pudo cerrar sesión' });
        res.clearCookie('connect.sid');
        res.json({ ok: true });
    });
});

app.get('/api/me', (req, res) => {
    if (req.session && req.session.userId) {
        return res.json({ id: req.session.userId, name: req.session.userName, is_admin: !!req.session.isAdmin });
    }
    return res.status(401).json({ message: 'No autenticado' });
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('id email name is_admin created_at').sort({ created_at: -1 });
        
        const formattedUsers = users.map(u => ({
            user_id: u.id, 
            email: u.email,
            name: u.name,
            is_admin: u.is_admin,
            created_at: u.created_at
        }));
        
        res.json(formattedUsers);
    } catch (err) {
        console.error('get users error', err);
        res.status(500).json({ message: 'Error al obtener usuarios: ' + err.message });
    }
});


// -------------------- API: Productos (CRUD - ADAPTADA A MONGODB) --------------------

app.get('/api/products', async (req, res) => {
    try {
        const showAll = req.query.all === '1';
        let filter = {};

        if (!showAll) {
            filter = { is_active: true, stock: { $gt: 0 } };
        }
        
        const products = await Product.find(filter).sort('name');
        
        const formattedProducts = products.map(p => ({
             id: p.id_sql, 
             name: p.name,
             price: p.price,
             description: p.description,
             image_url: p.image_url,
             video_id: p.video_id,
             stock: p.stock,
             is_active: p.is_active
        }));
        
        res.json(formattedProducts);
    } catch (err) {
        console.error('get products error', err);
        res.status(500).json({ message: 'Error al obtener lista de productos' });
    }
});

app.get('/api/products/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const product = await Product.findOne({ id_sql: id });
        
        if (!product) return res.status(404).json({ message: 'Producto no encontrado' });
        
        res.json({
             id: product.id_sql,
             name: product.name,
             price: product.price,
             description: product.description,
             image_url: product.image_url,
             video_id: product.video_id,
             stock: product.stock,
             is_active: product.is_active
        });
    } catch (err) {
        console.error('get product by id error', err);
        res.status(500).json({ message: 'Error al obtener detalle de producto' });
    }
});

app.post('/api/products', requireSession, async (req, res) => {
    const { name, price, description, image_url, video_id, stock, is_active } = req.body || {};
    try {
        const rawId = (name || 'prod').toString().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const id_sql = rawId.substring(0, 30) + '-' + Date.now();
        
        const newProduct = new Product({
            id_sql,
            name,
            price: price || 0,
            description: description || '',
            image_url: image_url || '',
            video_id: video_id || '',
            stock: stock || 0,
            is_active: is_active ? true : false
        });
        
        await newProduct.save();
        res.status(201).json({ id: id_sql, message: 'Producto creado con éxito.' });
    } catch (err) {
        console.error('create product error', err);
        if (err && err.code === 11000) return res.status(409).json({ message: 'Error: El ID generado ya existe.' });
        res.status(500).json({ message: 'Error en el servidor al crear producto' });
    }
});

app.put('/api/products/:id', requireSession, async (req, res) => {
    const id = req.params.id;
    const { name, price, description, image_url, video_id, stock, is_active } = req.body || {};
    
    const updateFields = {
        name,
        price: price || 0,
        description: description || '',
        image_url: image_url || '',
        video_id: video_id || '',
        stock: stock || 0,
        is_active: is_active ? true : false
    };

    try {
        const product = await Product.findOneAndUpdate({ id_sql: id }, updateFields, { new: true });
        
        if (!product) return res.status(404).json({ message: 'Producto no encontrado para actualizar.' });
        
        res.json({ message: 'Producto actualizado con éxito.' });
    } catch (err) {
        console.error('update product error', err);
        res.status(500).json({ message: 'Error en el servidor al actualizar producto.' });
    }
});

app.delete('/api/products/:id', requireSession, async (req, res) => {
    const id = req.params.id;
    try {
        const result = await Product.findOneAndDelete({ id_sql: id });
        
        if (!result) return res.status(404).json({ message: 'Producto no encontrado para eliminar.' });
        
        res.json({ message: 'Producto eliminado con éxito.' });
    } catch (err) {
        console.error('delete product error', err);
        res.status(500).json({ message: 'Error en el servidor al eliminar producto.' });
    }
});


// 8. INICIO DEL SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto: ${PORT}`);
    // 🚨 CORRECCIÓN 2: Mostrar el estado real de la conexión a MongoDB
    console.log(`Conectado a MongoDB OK, usando URI: ${process.env.MONGO_URI ? 'Definida' : 'URI no definida (Usando Default)'}`);
});
