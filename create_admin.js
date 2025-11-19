// Script temporal para crear un usuario administrador en la BD
require('dotenv').config({ path: './credenciales.env' });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async function(){
  try {
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'glam_app',
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    };

    const email = process.argv[2] || 'admin@admin.com';
    const password = process.argv[3] || 'admin123';
    const name = process.argv[4] || 'ADMIN';

    const hash = await bcrypt.hash(password, 10);
    const pool = await mysql.createPool(dbConfig);

    // Insert or update (si ya existe, actualizar password e is_admin)
    const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing && existing.length) {
      await pool.query('UPDATE users SET name = ?, password = ?, is_admin = 1 WHERE email = ?', [name, hash, email]);
      console.log('Usuario existente actualizado como admin:', email);
    } else {
      await pool.query('INSERT INTO users (email, name, password, is_admin) VALUES (?, ?, ?, 1)', [email, name, hash]);
      console.log('Usuario admin creado:', email);
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error creando admin:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
