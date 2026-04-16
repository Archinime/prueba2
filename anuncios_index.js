// ============================================
// ARCHIVO DE ANUNCIOS PARA ARCHINIME (VERSIÓN CON PRECARGA)
// ============================================

const listaAnuncios = [
  {
    id: 'banner_160x600',
    red: 'HighPerformanceFormat',
    descripcion: 'Banner vertical 160x600'
  }
];

let anuncioActual = null;

function inicializarAnuncio() {
  if (listaAnuncios.length > 0) {
    anuncioActual = listaAnuncios[0];
    console.log('✅ Anuncio cargado:', anuncioActual.red, anuncioActual.id);
  } else {
    console.warn('⚠️ No hay anuncios definidos');
  }
}

function crearTarjetaAnuncio() {
  if (!anuncioActual) {
    console.warn('❌ crearTarjetaAnuncio: anuncioActual es null');
    return null;
  }

  // Buscar el contenedor oculto que ya tiene el banner cargado
  const preloadContainer = document.getElementById('banner-preload');
  if (!preloadContainer) {
    console.warn('❌ No se encontró el contenedor #banner-preload');
    return null;
  }

  // Clonar el contenido del contenedor (para no mover el original)
  const bannerContent = preloadContainer.cloneNode(true);
  // Eliminar el estilo de posición absoluta del clon
  bannerContent.style.position = 'relative';
  bannerContent.style.left = '0';
  bannerContent.style.top = '0';
  bannerContent.style.width = '100%';
  bannerContent.style.height = '100%';
  bannerContent.style.overflow = 'hidden';
  bannerContent.style.zIndex = 'auto';

  // Crear la tarjeta
  const card = document.createElement('div');
  card.className = 'card card-ad';
  card.dataset.id = anuncioActual.id;

  // Contenedor interno para el banner
  const innerDiv = document.createElement('div');
  innerDiv.className = 'ad-inner-container';
  innerDiv.appendChild(bannerContent);

  card.appendChild(innerDiv);

  // Info discreta
  const infoDiv = document.createElement('div');
  infoDiv.className = 'info';
  infoDiv.innerHTML = `<strong>anuncio</strong><span>⚡</span>`;
  card.appendChild(infoDiv);

  console.log('📦 Tarjeta de anuncio creada (con banner precargado)');
  return card;
}

// Exportar al ámbito global
window.listaAnuncios = listaAnuncios;
window.inicializarAnuncio = inicializarAnuncio;
window.crearTarjetaAnuncio = crearTarjetaAnuncio;
window.anuncioActual = anuncioActual;