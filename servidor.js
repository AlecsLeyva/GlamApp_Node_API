// 1. CARGA DE VARIABLES DE ENTORNO
require('dotenv').config({ path: './credenciales.env' });

// 2. IMPORTACIÓN DE LIBRERÍAS
const express = require('express');
const twilio = require('twilio');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');

// 🚨 CAMBIO CLAVE: Reemplazar MySQL por Mongoose
const mongoose = require('mongoose'); // Usaremos Mongoose para la conexión y modelos

const app = express();

// ----------------------------------------------------
// 3. CONFIGURACIÓN DE MIDDLEWARE Y CONEXIÓN A DB
// ----------------------------------------------------

// 🚨 CONEXIÓN A MONGODB
// Asegúrate de definir MONGO_URI en tus variables de entorno (ej. en Render o credenciales.env)
// MONGO_URI=mongodb://localhost:27017/glam_app
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/glam_app1';
mongoose.connect(MONGO_URI)
    .then(() => console.log('Conexión a MongoDB OK'))
    .catch(err => console.error('Error conectando a MongoDB:', err.message || err));


// 🚨 DEFINICIÓN DE MODELOS (Esquemas de MongoDB/Mongoose)

// --- Modelo User ---
const UserSchema = new mongoose.Schema({
    // user_id de SQL es _id de MongoDB
    email: { type: String, required: true, unique: true }, // UNIQUE replicado
    name: { type: String, required: true },
    password: { type: String, required: true, select: false }, // No enviar el hash por defecto
    picture_url: String,
    is_admin: { type: Boolean, default: false }, // BOOLEAN en Mongoose
    created_at: { type: Date, default: Date.now } // TIMESTAMP a Date
});
const User = mongoose.model('User', UserSchema);

// --- Modelo Product ---
const ProductSchema = new mongoose.Schema({
    // id de SQL se mapea a _id si lo quieres mantener, o a un campo 'id'
    // Para simplificar, asumiremos que Mongoose genera el _id (ObjectId)
    id_sql: { type: String, required: true, unique: true }, // Almacenamos el ID de SQL como referencia
    name: { type: String, required: true },
    price: { type: Number, required: true }, // DECIMAL a Number (Double)
    description: String,
    image_url: String,
    video_id: String,
    stock: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true }
});
const Product = mongoose.model('Product', ProductSchema);


// El resto del código de Middlewares (CORS, Express, Sesiones, Logging) se mantiene igual
// ... (Aquí iría la configuración de CORS y Sesiones exactamente igual a tu original) ...

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
    // Comprueba que exista sesión Y que la variable de sesión isAdmin sea verdadera (true)
    if (req.session && req.session.userId && req.session.isAdmin) return next();
    return res.status(403).json({ message: 'No autorizado. Se requiere acceso de administrador.' });
}


// --- 4. ENDPOINT PARA EL ENVÍO DE SMS (Twilio) --- (Se mantiene igual, no usa DB)
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER; 
const client = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.post('/enviar-sms', async (req, res) => {
    // ... (Lógica de Twilio se mantiene igual) ...
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
        // 🚨 CAMBIO: Usar Mongoose para crear un nuevo documento
        const newUser = new User({ 
            name, 
            email, 
            password: hash, // Se guarda en el campo 'password'
            is_admin: false 
        });
        const result = await newUser.save(); // Guarda el documento
        
        // El ID en MongoDB es _id
        res.json({ id: result._id, name, email, message: 'Registro exitoso. Inicie sesión.' });
    } catch (err) {
        console.error('register error', err);
        // El código 11000 es el error de duplicado de MongoDB
        if (err && err.code === 11000) return res.status(409).json({ message: 'Usuario ya existe' }); 
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

app.post('/api/login', async (req, res) => {
    console.log('*** ENDPOINT /api/login llamado ***');
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Faltan campos.' });
    try {
        // 🚨 CAMBIO: Usar User.findOne para buscar el documento por email, incluyendo el campo 'password'
        const user = await User.findOne({ email }).select('+password');
        
        if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });
        
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
            console.log('Contraseña incorrecta para:', email);
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }
        
        console.log('LOGIN exitoso:', email, 'is_admin en BD:', user.is_admin);
        
        // Guardar en sesión: user._id es el equivalente a user_id
        req.session.userId = user._id.toString();
        req.session.userName = user.name;
        req.session.isAdmin = user.is_admin; // El valor ya es booleano
        
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
    // Se mantiene igual, usa la sesión
    if (req.session && req.session.userId) {
        return res.json({ id: req.session.userId, name: req.session.userName, is_admin: !!req.session.isAdmin });
    }
    return res.status(401).json({ message: 'No autenticado' });
});

// GET /api/users (Listar usuarios - ADAPTADA A MONGODB)
app.get('/api/users', async (req, res) => {
    try {
        // 🚨 CAMBIO: Usar User.find y select para obtener los campos deseados
        const users = await User.find().select('id email name is_admin created_at').sort({ created_at: -1 });
        
        // Mongoose usa 'id' como alias de '_id' automáticamente, lo cual es útil
        const formattedUsers = users.map(u => ({
            user_id: u.id, // Mapeamos 'id' de Mongoose a 'user_id' para consistencia del frontend
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

// GET /api/products (Listar todos)
app.get('/api/products', async (req, res) => {
    try {
        const showAll = req.query.all === '1';
        let filter = {}; // Filtro vacío (SELECT * from...)

        // 🚨 CAMBIO: Construir el filtro para find()
        if (!showAll) {
            filter = { is_active: true, stock: { $gt: 0 } };
        }
        
        const products = await Product.find(filter).sort('name');
        
        // Mapear los resultados para usar 'id' en lugar de '_id' si es necesario para el frontend
        const formattedProducts = products.map(p => ({
             id: p.id_sql, // Usar el campo id_sql que almacena el ID original
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

// GET /api/products/:id (Obtener detalle)
app.get('/api/products/:id', async (req, res) => {
    const id = req.params.id;
    try {
        // 🚨 CAMBIO: Buscar por el campo id_sql que contiene el ID de producto original
        const product = await Product.findOne({ id_sql: id });
        
        if (!product) return res.status(404).json({ message: 'Producto no encontrado' });
        
        // Mapear el resultado
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

// POST /api/products (Crear)
app.post('/api/products', requireSession, async (req, res) => {
    const { name, price, description, image_url, video_id, stock, is_active } = req.body || {};
    try {
        // Generamos el identificador original (id_sql) para mantener la compatibilidad
        const rawId = (name || 'prod').toString().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const id_sql = rawId.substring(0, 30) + '-' + Date.now();
        
        // 🚨 CAMBIO: Usar Mongoose para crear un nuevo documento
        const newProduct = new Product({
            id_sql,
            name,
            price: price || 0,
            description: description || '',
            image_url: image_url || '',
            video_id: video_id || '',
            stock: stock || 0,
            is_active: is_active ? true : false // Se espera un booleano en Mongoose
        });
        
        await newProduct.save();
        res.status(201).json({ id: id_sql, message: 'Producto creado con éxito.' });
    } catch (err) {
        console.error('create product error', err);
        // Error de duplicado 11000
        if (err && err.code === 11000) return res.status(409).json({ message: 'Error: El ID generado ya existe.' });
        res.status(500).json({ message: 'Error en el servidor al crear producto' });
    }
});

// PUT /api/products/:id (Actualizar)
app.put('/api/products/:id', requireSession, async (req, res) => {
    const id = req.params.id;
    const { name, price, description, image_url, video_id, stock, is_active } = req.body || {};
    
    // 🚨 CAMBIO: Usar findOneAndUpdate para buscar por id_sql y actualizar
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
        // Buscar por id_sql y actualizar (new: true retorna el documento actualizado)
        const product = await Product.findOneAndUpdate({ id_sql: id }, updateFields, { new: true });
        
        if (!product) return res.status(404).json({ message: 'Producto no encontrado para actualizar.' });
        
        res.json({ message: 'Producto actualizado con éxito.' });
    } catch (err) {
        console.error('update product error', err);
        res.status(500).json({ message: 'Error en el servidor al actualizar producto.' });
    }
});

// DELETE /api/products/:id (Eliminar)
app.delete('/api/products/:id', requireSession, async (req, res) => {
    const id = req.params.id;
    try {
        // 🚨 CAMBIO: Usar findOneAndDelete para buscar y eliminar
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
    console.log(`Conectado a MongoDB: ${mongodb+srv://ServicioLeyva:ServicioLeyva@servicioleyva.a8altxu.mongodb.net/}`);
});
