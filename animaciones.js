// Archivo: animaciones.js
// Lista de videos para efectos de pantalla verde/azul (Chroma Key)
// Mejorado: se añaden más opciones y se optimiza la carga

const videoList = [
  { id: 'hola', src: 'hola.mp4', keyColor: 'green', preset: { threshold: 0.25, diff: 0, soft: 100 } },
  { id: 'rem',  src: 'rem.mp4',  keyColor: 'green', preset: { threshold: 0.10, diff: 0, soft: 100  } },
  { id: 'rimuru',  src: 'rimuru.mp4',  keyColor: 'green', preset: { threshold: 0.10, diff: 0, soft: 100  } },
  { id: 'reze',  src: 'reze.mp4',  keyColor: 'green', preset: { threshold: 0.10, diff: 0, soft: 100  } },
  { id: 'levi',  src: 'levi.mp4',  keyColor: 'green', preset: { threshold: 0.10, diff: 0, soft: 100  } },
  { id: 'gojo',  src: 'gojo.mp4',  keyColor: 'green', preset: { threshold: 0.10, diff: 0, soft: 100  } },
  { id: 'nezuko', src: 'nezuko.mp4', keyColor: 'green', preset: { threshold: 0.10, diff: 0, soft: 100 } },
  { id: 'power', src: 'power.mp4', keyColor: 'green', preset: { threshold: 0.10, diff: 0, soft: 100 } },
];

// Si deseas agregar más, solo añádelos al array.