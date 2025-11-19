# Carpeta auth - Login y Registro (demo local)

Esta carpeta contiene páginas de autenticación muy simples para la demo local del proyecto.

Archivos:
- `login.html`: formulario de inicio de sesión.
- `register.html`: formulario de registro.
- `auth.css`: estilos minimalistas para las páginas.
- `auth.js`: lógica básica que guarda usuarios en localStorage y simula el inicio de sesión.

Cómo probar:
1. Abrir `Nueva carpeta/product.html` en el navegador (doble clic o servidor local).
2. Usar el enlace "Registro" para crear una cuenta (se guardará en localStorage).
3. Iniciar sesión con el correo y contraseña guardados.
4. Tras iniciar sesión, volverás a la tienda y verás tu nombre en la esquina superior derecha en `product.html`.

Notas de seguridad:
- Esto es solo una demostración local. No uses este sistema en producción.
- No se recomienda almacenar contraseñas en texto plano; en producción usa un backend y hashing seguro.
