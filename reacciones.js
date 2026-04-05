// ============================================
// SISTEMA DE REACCIONES TIPO FACEBOOK CYBERPUNK v2.5 (Diseño Premium)
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
        .comentario-footer-actions {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-top: 15px;
            position: relative;
            padding-top: 10px;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .btn-reaccionar-container {
            position: relative;
            display: inline-flex;
            align-items: center;
        }

        .btn-accion-footer {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.05);
            color: #aaa;
            font-family: 'Poppins', sans-serif;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            border-radius: 20px;
        }
        .btn-accion-footer:hover { 
            color: #fff; 
            background: rgba(0, 243, 255, 0.1);
            border-color: rgba(0, 243, 255, 0.4);
            box-shadow: 0 0 15px rgba(0, 243, 255, 0.2);
            transform: translateY(-2px);
        }

        .reactions-picker {
            position: absolute;
            bottom: calc(100% + 10px);
            left: -10px;
            background: rgba(10, 10, 15, 0.95);
            backdrop-filter: blur(20px);
            border: 1px solid var(--neon-primary, #00f3ff);
            border-radius: 40px;
            padding: 10px 18px;
            display: flex;
            gap: 15px;
            box-shadow: 0 15px 45px rgba(0, 0, 0, 0.9), 0 0 25px rgba(0, 243, 255, 0.25);
            opacity: 0;
            pointer-events: none;
            transform: translateY(20px) scale(0.8);
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            z-index: 99999;
        }
        
        .reactions-picker::after {
            content: '';
            position: absolute;
            bottom: -20px;
            left: 0;
            width: 100%;
            height: 20px;
        }
        
        .btn-reaccionar-container:hover .reactions-picker,
        .reactions-picker:hover {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0) scale(1);
        }

        .reaction-icon {
            font-size: 2rem;
            cursor: pointer;
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.2s;
            filter: grayscale(0.8) opacity(0.7);
            position: relative;
            transform-origin: bottom;
        }
        .reaction-icon:hover {
            transform: scale(1.6) translateY(-8px);
            filter: grayscale(0) opacity(1);
            z-index: 10;
        }

        .reactions-summary {
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(0, 0, 0, 0.5);
            padding: 6px 14px;
            border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.05);
            font-size: 0.85rem;
            color: #ddd;
            cursor: default;
            transition: all 0.3s;
            box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
        }
        .reactions-summary:hover {
            background: rgba(255,255,255,0.05);
            border-color: rgba(255,255,255,0.2);
            box-shadow: inset 0 0 10px rgba(0,0,0,0.5), 0 0 10px rgba(255,255,255,0.1);
        }
        .reactions-summary span {
            font-size: 1.2rem;
            margin-right: -6px;
            position: relative;
            z-index: 1;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));
        }
        .reactions-summary span:nth-child(2) { z-index: 2; }
        .reactions-summary span:nth-child(3) { z-index: 3; }
        .reactions-summary span:last-of-type {
            margin-right: 6px;
        }

        .user-reacted {
            font-weight: 800;
            background: rgba(255,255,255,0.08);
            box-shadow: inset 0 0 10px currentColor;
            border-color: currentColor;
        }
        .user-reacted:hover {
            box-shadow: 0 0 20px currentColor, inset 0 0 15px currentColor;
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

    const counts = {};
    userIds.forEach(uid => {
        const type = reactions[uid];
        counts[type] = (counts[type] || 0) + 1;
    });

    const sortedTypes = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
    const topIconsHTML = sortedTypes.map(type => `<span>${REACTIONS_MAP[type].emoji}</span>`).join('');

    const summaryHTML = total > 0 ? 
        `<div class="reactions-summary" title="${total} reacciones en total">
            ${topIconsHTML} <strong style="color: #fff; font-family: 'Orbitron'; margin-left: 5px; font-size: 1rem;">${total}</strong>
        </div>` : '';

    let btnReaccionarHTML = '';
    if (currentUserReaction && REACTIONS_MAP[currentUserReaction]) {
        const rData = REACTIONS_MAP[currentUserReaction];
        btnReaccionarHTML = `
            <button class="btn-accion-footer user-reacted" style="color: ${rData.color}" onclick="quitarReaccion('${commentId}')" title="Clic para quitar reacción">
                <span style="font-size: 1.2rem; filter: drop-shadow(0 0 5px ${rData.color});">${rData.emoji}</span> ${rData.name}
            </button>
        `;
    } else {
        btnReaccionarHTML = `
            <button class="btn-accion-footer">
                <i class="far fa-thumbs-up" style="font-size: 1.1rem;"></i> Reaccionar
            </button>
        `;
    }

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

injectReaccionesCSS();