// 1. Estado inicial del jugador (Actualizado con Inventario y Tiempo)
const defaultState = {
    coins: 100,
    energy: 100,
    level: 1,
    affinity: 0,
    lastEnergyUpdate: Date.now(), // Guarda la hora exacta de la última recarga
    inventory: [],                // Aquí guardaremos los objetos del Gacha
    equipped: {
        skin: 'default',
        poster: 'none'
    }
};

let playerState = {};

// Configuración de Energía
const MAX_ENERGY = 100;
const ENERGY_PER_TICK = 5; // Cuánta energía recupera
const TICK_INTERVAL = 60 * 1000; // Cada cuántos milisegundos (1 minuto)

// 2. Cargar datos al iniciar
function loadProgress() {
    const savedData = localStorage.getItem('archinimeUserData');
    if (savedData) {
        playerState = JSON.parse(savedData);
        
        // Parche de seguridad: si es un usuario viejo, le agregamos las nuevas variables
        if (!playerState.lastEnergyUpdate) playerState.lastEnergyUpdate = Date.now();
        if (!playerState.inventory) playerState.inventory = [];
        if (!playerState.equipped) playerState.equipped = { skin: 'default', poster: 'none' };
    } else {
        playerState = { ...defaultState };
        saveProgress();
    }
    
    // Calculamos si le toca energía por el tiempo que estuvo desconectado
    calculateOfflineEnergy();
    updateHUD();
    
    // Iniciamos un reloj para que recargue energía mientras está en el Lobby
    setInterval(calculateOfflineEnergy, 10000); // Revisa cada 10 segundos si ya pasó un minuto
}

// 3. Lógica Matemática del Paso del Tiempo
function calculateOfflineEnergy() {
    if (playerState.energy >= MAX_ENERGY) {
        playerState.lastEnergyUpdate = Date.now(); // Si está a tope, actualizamos el reloj y salimos
        return;
    }

    const now = Date.now();
    const timePassed = now - playerState.lastEnergyUpdate;
    const ticks = Math.floor(timePassed / TICK_INTERVAL); // Cuántos minutos enteros pasaron

    if (ticks > 0) {
        playerState.energy += ticks * ENERGY_PER_TICK;
        
        // Evitamos que la energía pase del máximo
        if (playerState.energy > MAX_ENERGY) {
            playerState.energy = MAX_ENERGY;
        }
        
        // Avanzamos el reloj del jugador
        playerState.lastEnergyUpdate += ticks * TICK_INTERVAL;
        
        saveProgress();
        updateHUD();
    }
}

// 4. Guardar progreso
function saveProgress() {
    localStorage.setItem('archinimeUserData', JSON.stringify(playerState));
}

// 5. Actualizar la interfaz
function updateHUD() {
    document.getElementById('coins-val').innerText = playerState.coins;
    document.getElementById('energy-val').innerText = playerState.energy;
    document.getElementById('level').innerText = `Nivel: ${playerState.level}`;
    document.getElementById('affinity-val').innerText = playerState.affinity;
}

// 6. Interacción básica con el personaje
document.getElementById('waifu-placeholder').addEventListener('click', () => {
    if (playerState.energy >= 5) {
        playerState.affinity += 1;
        playerState.energy -= 5;
        playerState.lastEnergyUpdate = Date.now(); // Reseteamos el reloj al gastar energía
        
        // Simulación de pequeña recompensa aleatoria
        if (Math.random() > 0.8) {
            playerState.coins += 10;
            alert("¡El personaje se alegró y encontraste 10 monedas!");
        }
        
        saveProgress();
        updateHUD();
    } else {
        alert("El personaje tiene demasiado sueño para jugar... ¡Vuelve en unos minutos para que descanse!");
        // Aquí entraría tu mecánica de recarga o "Minijuego Despertador"
    }
});

// Arrancar el sistema cuando carga la página
window.onload = loadProgress;