// doodstream-extractor.js - Extrae enlace directo de Doodstream
// Uso: const url = await extractDoodstreamUrl('https://playmogo.com/e/xxxx');

async function extractDoodstreamUrl(doodUrl) {
    // Proxy CORS gratuito para evitar bloqueos
    const CORS_PROXY = 'https://corsproxy.io/?url=';
    const targetUrl = CORS_PROXY + encodeURIComponent(doodUrl);
    
    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        
        // Patrones para encontrar el enlace directo .mp4 o .m3u8
        const patterns = [
            /file\s*:\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8))["']/i,
            /src\s*:\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8))["']/i,
            /video_url\s*=\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8))["']/i,
            /source\s*:\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8))["']/i,
            /{"file":"(https?:\/\/[^"]+\.(?:mp4|m3u8))"/i,
            /data-video-src=["'](https?:\/\/[^"']+\.(?:mp4|m3u8))["']/i,
            /<video[^>]+src=["'](https?:\/\/[^"']+\.(?:mp4|m3u8))["']/i
        ];
        
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        // Si no se encuentra, intentar buscar en contenido JavaScript ofuscado
        const jsMatch = html.match(/eval\s*\(function\s*\([^)]*\)\s*\{[^}]*\}\)/);
        if (jsMatch) {
            try {
                const decoded = eval(jsMatch[0]);
                const urlMatch = decoded.match(/(https?:\/\/[^"']+\.(?:mp4|m3u8))/i);
                if (urlMatch) return urlMatch[1];
            } catch (e) { /* ignorar */ }
        }
        
        return null;
    } catch (error) {
        console.warn('Error al extraer enlace Doodstream:', error);
        return null;
    }
}

// Hacer la función global para usarla desde cualquier lugar
window.extractDoodstreamUrl = extractDoodstreamUrl;