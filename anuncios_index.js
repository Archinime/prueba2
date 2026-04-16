// ============================================
// ARCHIVO DE ANUNCIOS PARA ARCHINIME - BANNER 160x600
// ============================================

const listaAnuncios = [
  {
    id: 'banner_160x600',
    red: 'HighPerformanceFormat',
    descripcion: 'Banner vertical 160x600',
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
];

// Variable global que almacenará el anuncio actual
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

  const card = document.createElement('div');
  card.className = 'card card-ad';
  card.dataset.id = anuncioActual.id;

  // Contenedor interno con una clase específica
  const innerDiv = document.createElement('div');
  innerDiv.className = 'ad-inner-container';
  innerDiv.innerHTML = anuncioActual.codigo;

  // Ejecutar los scripts que vienen dentro del código
  const scripts = innerDiv.querySelectorAll('script');
  scripts.forEach(oldScript => {
    const newScript = document.createElement('script');
    if (oldScript.src) {
      newScript.src = oldScript.src;
      newScript.async = true;
    } else {
      newScript.textContent = oldScript.textContent;
    }
    // Añadir al body para que se ejecute
    document.body.appendChild(newScript);
    oldScript.remove();
  });

  card.appendChild(innerDiv);

  // Info muy discreta
  const infoDiv = document.createElement('div');
  infoDiv.className = 'info';
  infoDiv.innerHTML = `<strong>anuncio</strong><span>⚡</span>`;
  card.appendChild(infoDiv);

  console.log('📦 Tarjeta de anuncio creada');
  return card;
}

// Exportar al ámbito global
window.listaAnuncios = listaAnuncios;
window.inicializarAnuncio = inicializarAnuncio;
window.crearTarjetaAnuncio = crearTarjetaAnuncio;
window.anuncioActual = anuncioActual;