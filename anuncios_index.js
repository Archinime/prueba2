// ============================================
// ARCHIVO DE ANUNCIOS PARA ARCHINIME
// BANNER 160x600
// ============================================

const listaAnuncios = [
  {
    id: 'mi_anuncio_160x600',
    red: 'HighPerformanceFormat',
    descripcion: 'Banner 160x600 - Código personalizado',
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

// Función auxiliar para obtener el código de un anuncio por su ID
function obtenerHTMLAnuncio(anuncioId) {
  const anuncio = listaAnuncios.find(a => a.id === anuncioId);
  if (!anuncio) return '<div>Anuncio no disponible</div>';
  return anuncio.codigo;
}

// Hacemos accesibles las variables globalmente
window.listaAnuncios = listaAnuncios;
window.obtenerHTMLAnuncio = obtenerHTMLAnuncio;