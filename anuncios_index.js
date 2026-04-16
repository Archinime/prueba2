// ============================================
// ARCHIVO DE ANUNCIOS PARA ARCHINIME
// BANNER 160x600 (formato vertical)
// ============================================

const listaAnuncios = [
  {
    id: 'banner_160x600',
    red: 'HighPerformanceFormat',
    descripcion: 'Banner vertical 160x600',
    // Código de tu proveedor (con el key que me diste)
    codigo: `
      <script>
        atOptions = {
          'key' : 'c80e9060ab41f7adc2b2ccc358ef6c65',
          'format' : 'iframe',
          'height' : 600,
          'width' : 160,
          'params' : {}
        };
      </script>
      <script src="https://www.highperformanceformat.com/c80e9060ab41f7adc2b2ccc358ef6c65/invoke.js"></script>
    `
  }
  // Si quieres añadir más banners, agrégalos aquí
];

// Variable global que almacenará el anuncio actual
let anuncioActual = null;

// Inicializa el anuncio (toma el primero de la lista, o puedes rotar)
function inicializarAnuncio() {
  if (listaAnuncios.length > 0) {
    // Para rotar aleatoriamente descomenta la siguiente línea:
    // const randomIndex = Math.floor(Math.random() * listaAnuncios.length);
    // anuncioActual = listaAnuncios[randomIndex];
    anuncioActual = listaAnuncios[0];
    console.log('✅ Anuncio cargado:', anuncioActual.red, anuncioActual.id);
  } else {
    console.warn('⚠️ No hay anuncios definidos en listaAnuncios');
  }
}

// Función que crea una tarjeta de anuncio (con la clase .card y .card-ad)
function crearTarjetaAnuncio() {
  if (!anuncioActual) return null;

  const card = document.createElement('div');
  card.className = 'card card-ad';
  card.dataset.id = anuncioActual.id;

  // Contenedor interno donde se inyectará el código del banner
  const innerDiv = document.createElement('div');
  innerDiv.className = 'ad-inner-container';
  innerDiv.innerHTML = anuncioActual.codigo;

  // Ejecutar los scripts que vienen dentro del código (necesario para que el banner se cargue)
  innerDiv.querySelectorAll('script').forEach(oldScript => {
    const newScript = document.createElement('script');
    if (oldScript.src) {
      newScript.src = oldScript.src;
      newScript.async = true;
    } else {
      newScript.textContent = oldScript.textContent;
    }
    // Añadir al body para que se ejecute en el contexto global
    document.body.appendChild(newScript);
    oldScript.remove();
  });

  card.appendChild(innerDiv);

  // Añadir la info de "Patrocinado" (muy disimulada)
  const infoDiv = document.createElement('div');
  infoDiv.className = 'info';
  infoDiv.innerHTML = `<strong>Anuncio</strong><span>⚡</span>`;
  card.appendChild(infoDiv);

  return card;
}

// Función que inserta un anuncio en el grid en una posición aleatoria
// Recibe el fragmento del grid, el array de animes y el índice actual
function insertarAnuncioAleatorio(fragment, animes, posicionForzada = null) {
  if (!anuncioActual) return false;
  // Determinar posición aleatoria (entre la 3ª y la penúltima posición)
  let posicion;
  if (posicionForzada !== null) {
    posicion = posicionForzada;
  } else {
    const min = 2; // después del tercer anime (índice 2)
    const max = animes.length - 1; // antes del último
    posicion = Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  // Si la posición es válida y no excede el número de animes
  if (posicion >= 0 && posicion < animes.length) {
    const adCard = crearTarjetaAnuncio();
    if (adCard) {
      // Insertar en el fragmento (esto es más complejo porque el fragmento ya tiene los animes)
      // Mejor devolver la posición y que el render lo maneje
      return { inserted: true, position: posicion, card: adCard };
    }
  }
  return { inserted: false, position: -1, card: null };
}

// Exportamos las funciones y variables necesarias al ámbito global
window.listaAnuncios = listaAnuncios;
window.inicializarAnuncio = inicializarAnuncio;
window.crearTarjetaAnuncio = crearTarjetaAnuncio;
window.insertarAnuncioAleatorio = insertarAnuncioAleatorio;
window.anuncioActual = anuncioActual;