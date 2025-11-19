// auth-check.js
// Utilidad para obtener el usuario desde /api/me

(function () {
    const BACKEND_URL = 'http://localhost:3000';

    /**
     * Obtiene el usuario logeado desde el backend.
     * Devuelve null si no hay sesión.
     */
    async function fetchUser() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/me`, {
                credentials: 'include'
            });
            if (!res.ok) return null;
            return await res.json();
        } catch (err) {
            console.warn("Error consultando /api/me", err);
            return null;
        }
    }

    /**
     * Protege páginas privadas.
     */
    async function requireAuth() {
        const user = await fetchUser();
        if (!user) {
            window.location.href = './login.html';
        }
        return user;
    }

    window.fetchUser = fetchUser;
    window.requireAuth = requireAuth;
})();
