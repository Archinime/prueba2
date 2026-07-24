// video-tutorial.js
// Muestra un popup con el tutorial de Brave y Archinime sin anuncios
(function() {
  // Esperar a que el sistema de notificaciones esté listo
  const checkNotif = setInterval(() => {
    if (window.NotificationSystem) {
      clearInterval(checkNotif);
      
      // Verificar si ya se mostró (usando localStorage)
      if (localStorage.getItem('archinime_video_tutorial_shown')) return;
      
      const notifSystem = window.NotificationSystem;
      
      // Crear una notificación personalizada
      const notif = {
        notifId: 'video_tutorial_001',
        type: 'TUTORIAL',
        animeId: 'tutorial_brave',
        title: '📺 Archinime SIN Publicidad',
        img: 'https://cdn.jsdelivr.net/gh/Archinime/Archivos-data@main/ads.avif',
        seasonCover: 'https://cdn.jsdelivr.net/gh/Archinime/Archivos-data@main/brave.avif',
        blockName: 'Guía rápida',
        epTitle: 'Mira el tutorial',
        date: Date.now(),
        seen: false,
        isFinal: false,
        // Al hacer clic en "VER AHORA" se abrirá este enlace
        url: 'https://cdn.jsdelivr.net/gh/Archinime/Archivos-data@main/tutorial.mp4' 
        // O si prefieres que se abra en un iframe dentro de tu página, puedes usar:
        // url: 'video-tutorial.html' (y crear esa página con el video incrustado)
      };
      
      // Agregar la notificación al historial y a la cola de popups
      notifSystem.addToHistory(notif);
      
      // Marcar como mostrado para que no se repita
      localStorage.setItem('archinime_video_tutorial_shown', 'true');
      
      // Forzar la aparición del popup
      notifSystem.attemptResumeQueue('video-tutorial');
    }
  }, 500); // Revisa cada 500ms hasta que NotificationSystem esté disponible
})();