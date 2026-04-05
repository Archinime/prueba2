// ============================================
// SISTEMA DE REACCIONES TIPO FACEBOOK CYBERPUNK v2.0
// ============================================

const REACTIONS_MAP = {
    'like':  { emoji: '👍', color: '#00f3ff', name: 'Me gusta' },
    'love':  { emoji: '❤️', color: '#ff0055', name: 'Me encanta' },
    'haha':  { emoji: '😂', color: '#f1c40f', name: 'Me divierte' },
    'wow':   { emoji: '😮', color: '#bc13fe', name: 'Me asombra' },
    'sad':   { emoji: '😢', color: '#0066ff', name: 'Me entristece' },
    'angry': { emoji: '😡', color: '#ff4757', name: 'Me enoja' }
};

function injectReaccionesCSS() {
    if (document.getElementById('archinime-reacciones-css')) return;
    const style = document.createElement('style');
    style.id = 'archinime-reacciones-css';
    style.innerHTML = `
        /* Contenedor principal de acciones al pie del comentario */
        .comentario-footer-actions {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-top: 10px;
            position: relative;
        }

        /* Contenedor relativo para que el menú flote correctamente */
        .btn-reaccionar-container {
            position: relative;
            display: inline-flex;
            align-items: center;
        }

        /* Botón base (Reaccionar) */
        .btn-accion-footer {
            background: transparent;
            border: none;
            color: #888;
            font-family: 'Poppins', sans-serif;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            transition: color 0.2s, transform 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            border-radius: 8px;
        }
        .btn-accion-footer:hover { 
            color: #fff; 
            background: rgba(255,255,255,0.05);
        }

        /* Picker Flotante de Reacciones */
        .reactions-picker {
            position: absolute;
            bottom: calc(100% + 5px); /* Subimos el menú un poco */
            left: -10px;
            background: rgba(15, 15, 20, 0.98);
            backdrop-filter: blur(15px);
            border: 1px solid var(--neon-primary);
            border-radius: 30px;
            padding: 8px 15px;
            display: flex;
            gap: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.95), 0 0 20px rgba(0, 243, 255, 0.3);
            opacity: 0;
            pointer-events: none;
            transform: translateY(15px) scale(0.9);
            transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            z-index: 9999; /* Z-index altísimo para que nada lo tape */
        }
        
        /* EL PUENTE INVISIBLE: Evita que el menú se cierre al mover el mouse */
        .reactions-picker::after {
            content: '';
            position: absolute;
            bottom: -20px;
            left: 0;
            width: 100%;
            height: 20px;
        }
        
        /* Mostrar Picker al pasar el mouse */
        .btn-reaccionar-container:hover .reactions-picker,
        .reactions-picker:hover {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0) scale(1);
        }

        /* Iconos dentro del picker */
        .reaction-icon {
            font-size: 1.8rem;
            cursor: pointer;
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), filter 0.2s;
            filter: grayscale(0.5);
            position: relative;
            transform-origin: bottom;
        }
        .reaction-icon:hover {
            transform: scale(1.5) translateY(-5px);
            filter: grayscale(0);
            z-index: 10;
        }

        /* Resumen de Reacciones (Ej: 👍❤️ 5) */
        .reactions-summary {
            display: flex;
            align-items: center;
            gap: 4px;
            background: rgba(0, 0, 0, 0.6);
            padding: 4px 12px;
            border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.08);
            font-size: 0.85rem;
            color: #ccc;
            cursor: default;
            transition: 0.2s;
            box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
        }
        .reactions-summary:hover {
            background: rgba(255,255,255,0.1);
            border-color: rgba(255,255,255,0.3);
        }
        .reactions-summary span {
            font-size: 1.1rem;
            margin-right: -4px; /* Superpone un poco los emojis */
        }
        .reactions-summary span:last-of-type {
            margin-right: 4px;
        }

        /* Estilo cuando el usuario ya reaccionó */
        .user-reacted {
            text-shadow: 0 0 10px currentColor;
            font-weight: 800;
            background: rgba(255,255,255,0.05);
        }
    `;
    document.head.appendChild(style);
}

window.toggleReaccion = async function(commentId, tipoReaccion) {
    if (!comentariosCurrentUser) return typeof openLoginModalFromComent === 'function' ? openLoginModalFromComent() : alert("Inicia sesión para reaccionar");

    const docRef = comentariosDb.collection('comments').doc(commentId);
    try {
        await docRef.update({
            [`reactions.${comentariosCurrentUser.uid}`]: tipoReaccion
        });
        
        // Efecto de sonido (opcional, usa el tuyo si existe)
        if(typeof playUISound === 'function') playUISound('click');
        
    } catch (e) {
        console.error("Error al reaccionar", e);
    }
};

window.quitarReaccion = async function(commentId) {
    if (!comentariosCurrentUser) return;

    const docRef = comentariosDb.collection('comments').doc(commentId);
    try {
        await docRef.update({
            [`reactions.${comentariosCurrentUser.uid}`]: firebase.firestore.FieldValue.delete()
        });
    } catch (e) {
        console.error("Error al quitar reacción", e);
    }
};

window.procesarReaccionesHTML = function(commentId, reactionsObj) {
    const reactions = reactionsObj || {};
    const userIds = Object.keys(reactions);
    const total = userIds.length;
    
    let currentUserReaction = null;
    if (comentariosCurrentUser && reactions[comentariosCurrentUser.uid]) {
        currentUserReaction = reactions[comentariosCurrentUser.uid];
    }

    // Calcular las 3 reacciones más usadas para el resumen
    const counts = {};
    userIds.forEach(uid => {
        const type = reactions[uid];
        counts[type] = (counts[type] || 0) + 1;
    });

    // Ordenar para mostrar los emojis más populares
    const sortedTypes = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
    const topIconsHTML = sortedTypes.map(type => `<span>${REACTIONS_MAP[type].emoji}</span>`).join('');

    const summaryHTML = total > 0 ? 
        `<div class="reactions-summary" title="${total} reacciones en total">
            ${topIconsHTML} <strong style="color: #fff; font-family: 'Poppins'; margin-left: 5px;">${total}</strong>
        </div>` : '';

    // Botón principal de reacción (Muestra el emoji que elegiste)
    let btnReaccionarHTML = '';
    if (currentUserReaction && REACTIONS_MAP[currentUserReaction]) {
        const rData = REACTIONS_MAP[currentUserReaction];
        btnReaccionarHTML = `
            <button class="btn-accion-footer user-reacted" style="color: ${rData.color}" onclick="quitarReaccion('${commentId}')" title="Clic para quitar reacción">
                <span style="font-size: 1.1rem;">${rData.emoji}</span> ${rData.name}
            </button>
        `;
    } else {
        btnReaccionarHTML = `
            <button class="btn-accion-footer">
                <i class="far fa-thumbs-up"></i> Reaccionar
            </button>
        `;
    }

    // El popup flotante (Aseguramos que el onClick pase exactamente el string del tipo)
    const pickerHTML = `
        <div class="reactions-picker">
            ${Object.keys(REACTIONS_MAP).map(type => 
                `<span class="reaction-icon" title="${REACTIONS_MAP[type].name}" onclick="toggleReaccion('${commentId}', '${type}')">${REACTIONS_MAP[type].emoji}</span>`
            ).join('')}
        </div>
    `;

    return `
        <div class="comentario-footer-actions">
            <div class="btn-reaccionar-container">
                ${btnReaccionarHTML}
                ${pickerHTML}
            </div>
            ${summaryHTML}
        </div>
    `;
};

// Inyectar CSS inmediatamente al cargar el script
injectReaccionesCSS();