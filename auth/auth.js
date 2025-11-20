// auth.js - Lógica de Autenticación para Glam App
(function(){
    // La URL base del servidor backend (Node/Express, etc.)
    const BACKEND_URL = 'https://glamappnodeapi-production.up.railway.app';
    
    // ⚠️ CORRECCIÓN DE RUTA: admin.html está en el mismo directorio 'auth'
    const ADMIN_PAGE = './admin.html'; 
    
    // URL de la página principal (tienda), asume que está un nivel arriba de 'auth'
    const HOME_PAGE = '../ProyectoUni2APIS.html'; 
    

    // ==============================================
    // UTILIDADES Y CONFIGURACIÓN INICIAL
    // ==============================================
    
    // Función de utilidad para mostrar mensajes (usando alert para la demo)
    function showMessage(msg){
        alert(msg);
    }

    // Obtener parámetros de URL
    const params = new URLSearchParams(window.location.search);
    const redirectParam = params.get('redirect');
    
    const registerForm = document.getElementById('register-form');
    const loginForm = document.getElementById('login-form');

    // Función para manejar la redirección final basada en el usuario y los parámetros
    function finalRedirect(user) {
        // 1. Si el servidor envió 'redirect' (máxima prioridad)
        if (user.redirect) {
             window.location.href = user.redirect;
             return;
        }

        // 2. Si hay un parámetro 'redirect' en la URL
        if (redirectParam) {
            window.location.href = decodeURIComponent(redirectParam);
            return;
        } 
        
        // 3. Si el usuario es administrador (usa la ruta corregida)
        if (user.isAdmin) {
             window.location.href = ADMIN_PAGE;
             return;
        }

        // 4. Por defecto, ir a la página principal
        window.location.href = HOME_PAGE;
    }

    // --------------------------------------
    // Crear admin por defecto (modo demo)
    // --------------------------------------
    try {
        if (!localStorage.getItem('glamAdmin')) {
            const defaultAdmin = { email: 'admin@admin.com', password: 'admin123', isAdmin: true };
            localStorage.setItem('glamAdmin', JSON.stringify(defaultAdmin));
        }
    } catch (e) {
        console.warn('No se pudo inicializar admin por defecto', e);
    }
    
    // --------------------------------------
    // Restaurar sesión de Google si hay token guardado
    // --------------------------------------
    try {
        const savedGoogleCred = localStorage.getItem('glamGoogleCredential');
        const savedUser = localStorage.getItem('glamCurrentUser');

        // Si hay credenciales de Google pero no hay un usuario activo guardado
        if (!savedUser && savedGoogleCred) {
            // Decodificar el JWT de forma básica (solo para obtener info pública)
            const parts = savedGoogleCred.split('.');
            if (parts.length >= 2) {
                const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                const json = decodeURIComponent(atob(base64).split('').map(function(c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
                try {
                    const data = JSON.parse(json);
                    const user = { 
                        name: data.name || data.email, 
                        email: data.email, 
                        isAdmin: false 
                    };
                    localStorage.setItem('glamCurrentUser', JSON.stringify(user));
                    console.log('Sesión restaurada desde Google Credential.');
                } catch (e) {
                    console.warn('No se pudo parsear la credencial de Google almacenada', e);
                }
            }
        }
    } catch (e) {
        console.warn('Error restaurando sesión desde localStorage', e);
    }

    // ==============================================
    // LÓGICA DE AUTENTICACIÓN POR GOOGLE
    // ==============================================

    /**
     * Handler que el SDK de Google llama al iniciar sesión.
     */
    window.handleGoogleLogin = function(response) {
        if (!response || !response.credential) {
            showMessage('Error al obtener credenciales de Google.');
            return;
        }

        const googleCredential = response.credential;
        
        localStorage.setItem('glamGoogleCredential', googleCredential);
        localStorage.removeItem('glamCurrentUser'); 

        showMessage('Iniciando sesión con Google...');

        // 2. Enviar la credencial al servidor para validación y sesión
        fetch(`${BACKEND_URL}/api/google-login`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: googleCredential }),
            credentials: 'include'
        })
        .then(r => {
            if (r.ok) return r.json();
            return r.json().then(j => { throw new Error(j.message || 'Error en validación de Google.'); });
        })
        .then(user => {
            // 3. Guardar el usuario localmente
            localStorage.setItem('glamCurrentUser', JSON.stringify({
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin // ¡Debe venir del backend!
            }));
            
            showMessage('¡Bienvenido ' + (user.name || user.email) + '!');
            
            finalRedirect(user);
        })
        .catch(err => {
            showMessage(err.message || 'Error iniciando sesión con Google.');
            localStorage.removeItem('glamGoogleCredential');
        });
    }


    // ==============================================
    // LÓGICA DE AUTENTICACIÓN POR FORMULARIO
    // ==============================================

    // --------------------------------------
    // REGISTRO (Si existe el formulario register-form)
    // --------------------------------------
    if (registerForm) {
        registerForm.addEventListener('submit', function(e){
            e.preventDefault();
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            if (!name || !email || password.length < 4) {
                showMessage('Completa todos los campos correctamente. La contraseña debe tener al menos 4 caracteres.');
                return;
            }

            fetch(`${BACKEND_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password }),
                credentials: 'include'
            })
            .then(r => {
                if (r.ok) return r.json();
                if (r.status === 409) throw new Error('Ya existe una cuenta con ese correo.');
                return r.json().then(j => { throw new Error(j.message || 'Error en el servidor.'); });
            })
            .then(_ => {
                showMessage('Cuenta creada. Ahora puedes iniciar sesión.');
                if (redirectParam) {
                    window.location.href = 'login.html?redirect=' + encodeURIComponent(redirectParam);
                } else {
                    window.location.href = 'login.html';
                }
            })
            .catch(err => showMessage(err.message || 'Error registrando'));
        });
    }

    // --------------------------------------
    // LOGIN (Si existe el formulario login-form)
    // --------------------------------------
    if (loginForm) {
        loginForm.addEventListener('submit', function(e){
            e.preventDefault();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            
            // Lógica de DEMO para admin local
            const adminData = JSON.parse(localStorage.getItem('glamAdmin') || '{}');
            if (email === adminData.email && password === adminData.password) {
                const user = { name: 'Administrador Local', email: email, isAdmin: true }; // isAdmin: true para el usuario de demo
                localStorage.setItem('glamCurrentUser', JSON.stringify(user));
                localStorage.removeItem('glamGoogleCredential');
                showMessage('¡Bienvenido Administrador Local!');
                finalRedirect(user);
                return;
            }

            // Llamada al backend para login real
            fetch(`${BACKEND_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include'
            })
            .then(r => {
                if (r.ok) return r.json();
                return r.json().then(j => { throw new Error(j.message || 'Credenciales inválidas'); });
            })
            .then(user => {
                try {
                    // Guardar datos del usuario
                    localStorage.setItem('glamCurrentUser', JSON.stringify({
                        name: user.name,
                        email: user.email,
                        isAdmin: user.isAdmin // ¡Debe ser enviado por el backend!
                    }));
                    localStorage.removeItem('glamGoogleCredential');
                } catch(e){}

                showMessage('¡Bienvenido ' + (user.name || user.email) + '!');
                
                finalRedirect(user);
            })
            .catch(err => showMessage(err.message || 'Credenciales inválidas.'));
        });
    }
})();
