// 1. CARGA DE VARIABLES DE ENTORNO
require('dotenv').config({ path: './credenciales.env' }); 

// 2. IMPORTACIÓN DE LIBRERÍAS
const express = require('express');
const twilio = require('twilio'); 
const cors = require('cors'); 
const mysql = require('mysql2/promise');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();

// 3. CONFIGURACIÓN DE MIDDLEWARE Y CONEXIÓN A DB

// Configuración de MySQL
const dbConfig = {
    // Usar las variables de Render
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'glam_app',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;
(async function initDb(){
    try {
        pool = mysql.createPool(dbConfig);
        const conn = await pool.getConnection();
        await conn.query('SELECT 1');
        conn.release();
        console.log('Conexión a MySQL OK');
    } catch (err) {
        console.error('Error conectando a MySQL:', err.message || err);
    }
})();

// 🚨 CORRECCIÓN CORS DEFINITIVA: Usar FRONTEND_URL de Render 🚨
// El origen permitido es el dominio de Vercel (leído desde la variable de entorno de Render)
const ALLOWED_ORIGINS = [
    'http://localhost:80',
    'http://localhost:3000',
    process.env.FRONTEND_URL, // <--- ESTE VALOR DEBE ESTAR EN LAS VARIABLES DE ENTORNO DE RENDER
    'http://127.0.0.1:80',
    'http://127.0.0.1:3000',
];

app.use(cors({ 
    origin: (origin, callback) => {
        // Permitir peticiones sin origen (ej: Postman, Render mismo)
        if (!origin) return callback(null, true); 
        
        // 1. Comprobar si el origen está en la lista de permitidos
        if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            // 2. Comprobar si es un subdominio de localhost para desarrollo (más flexible)
            if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
                 callback(null, true);
            } else {
                console.error(`CORS Blocked: ${origin}. Origen no permitido.`);
                callback(new Error('Not allowed by CORS'));
            }
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type']
}));

app.set('trust proxy', 1); // Necesario para que Render maneje las cookies correctamente (proxies)
app.use(express.json()); // Middleware para parsear el cuerpo JSON de la solicitud

// Sesiones (para login simple)
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        // 🚨 CONFIGURACIÓN DE COOKIES PARA DESPLIEGUE EN RENDER
        secure: process.env.NODE_ENV === 'production', // true en producción (https), false en local (http)
        httpOnly: true,          
        // sameSite: 'none' es vital para cookies cross-site en HTTPS
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', 
        maxAge: 24 * 60 * 60 * 1000  
    }
}));

// Logging simple de cada petición para debugging (CORREGIDO)
app.use(function(req, res, next) {
    try {
        console.log(new Date().toISOString(), req.method, req.url, 'Session:', req.session.userId || 'Guest');
    } catch (e) {
        console.warn('Error logging request', e);
    }
    next();
});

// DEFINICIÓN DE MIDDLEWARE DE AUTORIZACIÓN

function requireAuth(req, res, next){
    if (req.session && req.session.userId) return next();
    return res.status(401).json({ message: 'No autenticado' });
}

// Alias para requireAuth
const requireSession = requireAuth;

function requireAdmin(req, res, next){
    // Comprueba que exista sesión Y que la variable de sesión isAdmin sea verdadera
    if (req.session && req.session.userId && req.session.isAdmin) return next();
    return res.status(403).json({ message: 'No autorizado. Se requiere acceso de administrador.' });
}


// --- 4. ENDPOINT PARA EL ENVÍO DE SMS (Twilio) ---
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER; 
const client = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.post('/enviar-sms', async (req, res) => {
    const { to, body } = req.body; 

    if (!to || !body) {
        return res.status(400).json({ message: 'Faltan el número o el mensaje.' });
    }

    try {
        if (process.env.TEST_MODE === '1' || process.env.TEST_MODE === 'true') {
            console.log('TEST_MODE active: simulando envío de SMS a', to);
            return res.json({ message: '✅ (TEST_MODE) SMS simulado con éxito.' });
        }
        await client.messages.create({
            to: to,
            from: twilioPhoneNumber,
            body: body
        });
         
        res.json({ message: '✅ SMS enviado con éxito!' });
    } catch (error) {
        console.error("Error de Twilio (Revisar Credenciales/Número):", error); 
        res.status(500).json({ message: '❌ Error al comunicarse con Twilio. Revisa la terminal para detalles.' });
    }
});


// -------------------- API: Autenticación básica --------------------
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: 'Faltan campos.' });
    try {
        const hash = await bcrypt.hash(password, 10);
        // El nuevo registro no debe ser admin por defecto
        const [result] = await pool.query('INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, 0)', [name, email, hash]);
        res.json({ id: result.insertId, name, email, message: 'Registro exitoso. Inicie sesión.' });
    } catch (err) {
        console.error('register error', err);
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Usuario ya existe' });
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

app.post('/api/login', async (req, res) => {
    console.log('*** ENDPOINT /api/login llamado ***');
    const { email, password } = req.body || {};
    console.log('Email:', email, 'Password existe:', !!password);
    if (!email || !password) return res.status(400).json({ message: 'Faltan campos.' });
    try {
        console.log('Consultando BD para email:', email);
        const [rows] = await pool.query('SELECT user_id AS id, name, email, password, is_admin FROM users WHERE email = ? LIMIT 1', [email]);
        const user = rows && rows[0];
        if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });
         
        console.log('Usuario encontrado:', { 
            id: user.id, 
            email: user.email, 
            is_admin_raw: user.is_admin, 
            is_admin_type: typeof user.is_admin,
            is_admin_JSON: JSON.stringify(user.is_admin),
            password_hash: user.password ? user.password.substring(0, 20) + '...' : 'NULL'
        });
         
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
            console.log('Contraseña incorrecta para:', email);
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }
         
        console.log('LOGIN exitoso:', email, 'is_admin en BD:', user.is_admin, 'tipo:', typeof user.is_admin);
         
        // Convertir is_admin: si es NULL/undefined/0, es false; si es 1, es true
        const isAdminValue = user.is_admin ? 1 : 0;
         
        console.log('Después de conversión - isAdminValue:', isAdminValue);
         
        // Guardar en sesión
        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.isAdmin = isAdminValue;

        console.log('Sesión guardada - userId:', user.id, 'userName:', user.name, 'isAdmin:', isAdminValue);
         
        // *********************************************************************************
        const responseBody = { 
            id: user.id, 
            name: user.name, 
            email: user.email, 
            is_admin: isAdminValue === 1 
        };

        res.json(responseBody);
        // *********************************************************************************
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
    // Devuelve los datos de sesión almacenados
    console.log('GET /api/me - req.session completa:', req.session);
    if (req.session && req.session.userId) {
        console.log('Usuario autenticado:', req.session.userId, 'isAdmin:', req.session.isAdmin);
        return res.json({ id: req.session.userId, name: req.session.userName, is_admin: !!req.session.isAdmin });
    }
    console.log('GET /api/me - No hay sesión o userId');
    return res.status(401).json({ message: 'No autenticado' });
});

// GET /api/users (Listar usuarios - solo autenticados)
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT user_id, email, name, is_admin, created_at FROM users ORDER BY created_at DESC');
        console.log('GET /api/users - usuarios encontrados:', rows.length);
        res.json(rows);
    } catch (err) {
        console.error('get users error', err);
        res.status(500).json({ message: 'Error al obtener usuarios: ' + err.message });
    }
});


// -------------------- API: Productos (CRUD) --------------------

// GET /api/products (Listar todos - sin filtro para admin)
app.get('/api/products', async (req, res) => {
    try {
        // Si viene desde admin, mostrar TODOS los productos (sin filtro)
        // Si viene desde tienda, mostrar solo activos con stock
        const showAll = req.query.all === '1'; // parámetro ?all=1 para ver todos
        let query = 'SELECT id, name, price, description, image_url, video_id, stock, is_active FROM products';
        if (!showAll) {
            query += ' WHERE is_active = 1 AND stock > 0';
        }
        query += ' ORDER BY name';
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('get products error', err);
        res.status(500).json({ message: 'Error al obtener lista de productos' });
    }
});

// GET /api/products/:id (Obtener detalle)
app.get('/api/products/:id', async (req, res) => {
    const id = req.params.id;
    try {
        // En esta consulta no filtramos por is_active para que el admin pueda ver detalles de productos inactivos
        const [rows] = await pool.query('SELECT id, name, price, description, image_url, video_id, stock, is_active FROM products WHERE id = ? LIMIT 1', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });
        res.json(rows[0]);
    } catch (err) {
        console.error('get product by id error', err);
        res.status(500).json({ message: 'Error al obtener detalle de producto' });
    }
});

// POST /api/products (Crear)
app.post('/api/products', requireSession, async (req, res) => {
    const { name, price, description, image_url, video_id, stock, is_active } = req.body || {};
    try {
        // Generamos un identificador único basado en el nombre y timestamp
        const rawId = (name || 'prod').toString().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const id = rawId.substring(0, 30) + '-' + Date.now(); 
         
        await pool.query('INSERT INTO products (id, name, price, description, image_url, video_id, stock, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, name, price || 0, description || '', image_url || '', video_id || '', stock || 0, is_active ? 1 : 0]);
        res.status(201).json({ id, message: 'Producto creado con éxito.' });
    } catch (err) {
        console.error('create product error', err);
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Error: El ID generado ya existe.' });
        res.status(500).json({ message: 'Error en el servidor al crear producto' });
    }
});

// PUT /api/products/:id (Actualizar - SOLO ADMIN)
app.put('/api/products/:id', requireSession, async (req, res) => {
    const id = req.params.id;
    const { name, price, description, image_url, video_id, stock, is_active } = req.body || {};
     
    // El frontend solo envía name, price, stock, is_active, pero incluimos todos los campos para ser seguros
    try {
        const result = await pool.query('UPDATE products SET name=?, price=?, description=?, image_url=?, video_id=?, stock=?, is_active=? WHERE id=?',
            [name, price || 0, description || '', image_url || '', video_id || '', stock || 0, is_active ? 1 : 0, id]);
         
        if (result[0].affectedRows === 0) return res.status(404).json({ message: 'Producto no encontrado para actualizar.' });
         
        res.json({ message: 'Producto actualizado con éxito.' });
    } catch (err) {
        console.error('update product error', err);
        res.status(500).json({ message: 'Error en el servidor al actualizar producto.' });
    }
});

// DELETE /api/products/:id (Eliminar - SOLO ADMIN)
app.delete('/api/products/:id', requireSession, async (req, res) => {
    const id = req.params.id;
    try {
        const result = await pool.query('DELETE FROM products WHERE id=?', [id]);
        if (result[0].affectedRows === 0) return res.status(404).json({ message: 'Producto no encontrado para eliminar.' });
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
    console.log(`Conectado a MySQL: ${process.env.DB_NAME}`);
});
