// ============================================
// ARCHIVO DE ANUNCIOS PARA ARCHINIME
// SOLO CONTIENE EL CÓDIGO DE TU PROVEEDOR
// ============================================

const listaAnuncios = [
  {
    id: 'mi_anuncio_300x250',
    red: 'HighPerformanceFormat',
    descripcion: 'Banner 300x250 - Código personalizado',
    codigo: `
      <script>
        atOptions = {
          'key' : 'c80e9060ab41f7adc2b2ccc358ef6c65',
          'format' : 'iframe',
          'height' : 250,
          'width' : 300,
          'params' : {}
        };
      </script>
      <script src="https://www.highperformanceformat.com/c80e9060ab41f7adc2b2ccc358ef6c65/invoke.js"></script>
    `
  }
  // Si quieres más anuncios, agrégalos aquí y la función aleatoria los elegirá
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