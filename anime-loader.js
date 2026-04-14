// Variables de estado global
let lastVisibleAnime = null;
let isFetchingAnimes = false;
let hasMoreAnimes = true;
const ANIMES_PER_PAGE = 20;

async function cargarAnimesPaginado() {
    // Evitar llamadas duplicadas o si ya no hay más datos
    if (isFetchingAnimes || !hasMoreAnimes) return;
    
    isFetchingAnimes = true;
    
    // Opcional: Mostrar un loader de red en la UI aquí

    try {
        let query = db.collection('catalogo')
                      .orderBy('title')
                      .limit(ANIMES_PER_PAGE);

        // Si ya tenemos un cursor, empezamos después de él
        if (lastVisibleAnime) {
            query = query.startAfter(lastVisibleAnime);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            hasMoreAnimes = false;
            // Opcional: Mostrar mensaje "No hay más animes"
            return;
        }

        // Actualizar el cursor con el último documento del bloque
        lastVisibleAnime = snapshot.docs[snapshot.docs.length - 1];

        // Mapear los datos y enviarlos a tu función de renderizado
        const animes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Asumiendo que renderAnimes acepta un array y un booleano para "hacer append"
        renderAnimes(animes, true); 

    } catch (error) {
        console.error("Error en la transmisión de datos:", error);
    } finally {
        isFetchingAnimes = false;
    }
}

// ---------------------------------------------------------
// Infinite Scroll Listener
// ---------------------------------------------------------
window.addEventListener('scroll', () => {
    // Calculamos si el usuario está a 500px del final de la página
    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.body.offsetHeight - 500;

    if (scrollPosition >= threshold) {
        cargarAnimesPaginado();
    }
});

// Inicializar la primera carga al abrir la página
document.addEventListener('DOMContentLoaded', () => {
    cargarAnimesPaginado();
});