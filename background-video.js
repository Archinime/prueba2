// background-video.js - Cambio dinámico de fondo de video

// 1. Lista de videos disponibles
const fondosDisponibles = [
    { id: 'galaxia', nombre: '🌌 Galaxia', url: 'galaxia.mp4' },
    { id: 'cyberpunk', nombre: '🌃 Cyberpunk', url: 'videos/ciudad_cyberpunk.mp4' },
    { id: 'abstracto', nombre: '✨ Abstracto', url: 'videos/lineas_neon.mp4' }
];

// 2. Función para cambiar el video de fondo
function cambiarFondoVideo(url) {
    const videoBg = document.getElementById('bg-video');
    if (videoBg) {
        // Pequeño fade para suavizar el cambio
        videoBg.style.transition = 'opacity 0.5s ease';
        videoBg.style.opacity = '0';
        setTimeout(() => {
            videoBg.src = url;
            videoBg.load();
            videoBg.play().catch(e => console.log("Error al reproducir fondo:", e));
            videoBg.style.opacity = '1';
        }, 200);
    }
}

// 3. Guardar preferencia en localStorage
function guardarFondoPreferido(idVideo) {
    localStorage.setItem('fondoPreferido', idVideo);
}

// 4. Al cargar la página, recuperar la última selección
function aplicarFondoGuardado() {
    const fondoGuardado = localStorage.getItem('fondoPreferido');
    if (fondoGuardado) {
        const video = fondosDisponibles.find(v => v.id === fondoGuardado);
        if (video) {
            cambiarFondoVideo(video.url);
            // Sincronizar el selector si ya existe
            const selector = document.getElementById('selectorFondo');
            if (selector) selector.value = fondoGuardado;
        }
    }
}

// Exponer funciones globalmente para usarlas desde el HTML
window.fondosDisponibles = fondosDisponibles;
window.cambiarFondoVideo = cambiarFondoVideo;
window.guardarFondoPreferido = guardarFondoPreferido;

// Inicializar al cargar el DOM
document.addEventListener('DOMContentLoaded', aplicarFondoGuardado);