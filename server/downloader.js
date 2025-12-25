// ===== IMPORTS =====
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ===== CONFIGURATION =====
const DOWNLOAD_DIR = path.join(__dirname, '../downloads');

// Créer le dossier downloads s'il n'existe pas
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    console.log('📁 Dossier downloads créé');
}

// ===== FONCTION PRINCIPALE =====
async function downloadVideo(url, platform) {
    console.log(`🎬 Téléchargement ${platform}: ${url}`);
    
    try {
        let videoPath = null;
        
        switch (platform) {
            case 'tiktok':
                videoPath = await downloadTikTok(url);
                break;
            case 'instagram':
                videoPath = await downloadInstagram(url);
                break;
            case 'pinterest':
                videoPath = await downloadPinterest(url);
                break;
            default:
                throw new Error('Plateforme non supportée');
        }
        
        return videoPath;
        
    } catch (error) {
        console.error(`❌ Erreur téléchargement ${platform}:`, error.message);
        throw error;
    }
}

// ===== TIKTOK - HD avec TikWM API =====
async function downloadTikTok(url) {
    try {
        console.log('🎵 Utilisation TikWM API (HD, sans watermark)...');
        
        const response = await axios.post('https://www.tikwm.com/api/', {
            url: url,
            hd: 1  // HD activé
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
        
        if (response.data.code !== 0) {
            throw new Error('Erreur API TikWM: ' + (response.data.msg || 'Vidéo non disponible'));
        }
        
        // Priorité : HD > play (normal)
        const videoUrl = response.data.data.hdplay || response.data.data.play;
        
        if (!videoUrl) {
            throw new Error('URL vidéo TikTok non trouvée');
        }
        
        console.log('✅ URL TikTok HD récupérée, téléchargement...');
        
        // Télécharger la vidéo
        return await downloadFromUrl(videoUrl, 'tiktok');
        
    } catch (error) {
        console.error('❌ Erreur TikWM:', error.message);
        throw new Error('Impossible de télécharger cette vidéo TikTok. Le lien est peut-être invalide ou la vidéo a été supprimée.');
    }
}

// ===== INSTAGRAM - Multiple APIs avec fallback =====
async function downloadInstagram(url) {
    console.log('📸 Téléchargement Instagram...');
    
    // Méthode 1 : SaveFrom API (NOUVELLE)
    try {
        console.log('Tentative SaveFrom API...');
        return await downloadInstagramSaveFrom(url);
    } catch (error) {
        console.log('SaveFrom échoué:', error.message);
    }
    
    // Méthode 2 : SnapInsta API (NOUVELLE)
    try {
        console.log('Tentative SnapInsta API...');
        return await downloadInstagramSnapInsta(url);
    } catch (error) {
        console.log('SnapInsta échoué:', error.message);
    }
    
    // Méthode 3 : Scraping direct
    try {
        console.log('Tentative scraping Instagram...');
        return await downloadInstagramScraping(url);
    } catch (error) {
        console.log('Scraping échoué:', error.message);
    }
    
    // Toutes les méthodes ont échoué
    throw new Error('Impossible de télécharger cette vidéo Instagram. Vérifiez que le compte n\'est pas privé et que c\'est bien une vidéo.');
}

// Instagram - SaveFrom API
async function downloadInstagramSaveFrom(url) {
    const response = await axios.post('https://saveig.app/api/ajaxSearch', 
        `q=${encodeURIComponent(url)}&t=media&lang=en`,
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 20000
        }
    );
    
    if (response.data && response.data.data) {
        // Parser le HTML pour trouver l'URL vidéo
        const html = response.data.data;
        const match = html.match(/href="([^"]+)"[^>]*download[^>]*>.*?Download/i);
        
        if (match && match[1]) {
            const videoUrl = match[1];
            console.log('✅ URL Instagram trouvée via SaveFrom');
            return await downloadFromUrl(videoUrl, 'instagram');
        }
    }
    
    throw new Error('URL non trouvée via SaveFrom');
}

// Instagram - SnapInsta API
async function downloadInstagramSnapInsta(url) {
    const response = await axios.post('https://snapinsta.app/api/ajaxSearch', 
        `q=${encodeURIComponent(url)}&t=media&lang=en`,
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 20000
        }
    );
    
    if (response.data && response.data.data) {
        const html = response.data.data;
        
        // Chercher l'URL de la vidéo HD
        const hdMatch = html.match(/href="([^"]+)"[^>]*>.*?HD.*?<\/a>/i);
        const normalMatch = html.match(/href="([^"]+)"[^>]*download[^>]*>/i);
        
        const match = hdMatch || normalMatch;
        
        if (match && match[1]) {
            const videoUrl = match[1];
            console.log('✅ URL Instagram trouvée via SnapInsta');
            return await downloadFromUrl(videoUrl, 'instagram');
        }
    }
    
    throw new Error('URL non trouvée via SnapInsta');
}

// Instagram - Scraping direct (fallback)
async function downloadInstagramScraping(url) {
    console.log('📸 Scraping direct Instagram...');
    
    // Nettoyer l'URL
    let cleanUrl = url;
    if (url.includes('?')) {
        cleanUrl = url.split('?')[0];
    }
    if (!cleanUrl.endsWith('/')) {
        cleanUrl += '/';
    }
    
    const response = await axios.get(cleanUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive'
        },
        timeout: 30000
    });
    
    // Chercher l'URL vidéo dans différents formats
    const patterns = [
        /"video_url":"([^"]+)"/,
        /"playback_url":"([^"]+)"/,
        /video_url=([^&]+)/,
        /"src":"([^"]*\.mp4[^"]*)"/
    ];
    
    for (const pattern of patterns) {
        const match = response.data.match(pattern);
        if (match && match[1]) {
            let videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\/g, '');
            console.log('✅ URL vidéo trouvée via scraping');
            return await downloadFromUrl(videoUrl, 'instagram');
        }
    }
    
    throw new Error('URL vidéo non trouvée dans le HTML');
}

// ===== PINTEREST - Amélioré avec meilleure détection =====
async function downloadPinterest(url) {
    try {
        console.log('📌 Scraping Pinterest...');
        
        // Nettoyer l'URL
        let cleanUrl = url;
        if (url.includes('pin.it')) {
            // Résoudre les URLs raccourcies
            const response = await axios.get(url, {
                maxRedirects: 5,
                validateStatus: () => true
            });
            cleanUrl = response.request.res.responseUrl || url;
        }
        
        console.log('📌 URL Pinterest:', cleanUrl);
        
        const response = await axios.get(cleanUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 30000
        });
        
        // Chercher les URLs vidéo dans différents formats
        const patterns = [
            /"contentUrl":"([^"]+)"/,
            /"video_list":\s*\{[^}]*"V_720P":\s*\{[^}]*"url":"([^"]+)"/,
            /"video_list":\s*\{[^}]*"V_HLSV4":\s*\{[^}]*"url":"([^"]+)"/,
            /"videos":\s*\{[^}]*"video_list":\s*\{[^}]*"V_\w+":\s*\{[^}]*"url":"([^"]+)"/,
            /"url":"(https:\/\/[^"]*\.mp4[^"]*)"/
        ];
        
        for (const pattern of patterns) {
            const match = response.data.match(pattern);
            if (match && match[1]) {
                let videoUrl = match[1].replace(/\\/g, '');
                console.log('✅ URL Pinterest trouvée');
                return await downloadFromUrl(videoUrl, 'pinterest');
            }
        }
        
        throw new Error('URL vidéo Pinterest non trouvée dans le HTML');
        
    } catch (error) {
        console.error('❌ Erreur Pinterest:', error.message);
        throw new Error('Impossible de télécharger cette vidéo Pinterest. Vérifiez que le lien contient bien une vidéo et non une image.');
    }
}

// ===== TÉLÉCHARGER DEPUIS URL (avec meilleure qualité) =====
async function downloadFromUrl(videoUrl, platform) {
    try {
        const filename = `${platform}_${Date.now()}.mp4`;
        const filepath = path.join(DOWNLOAD_DIR, filename);
        
        console.log(`⬇️ Téléchargement de la vidéo HD...`);
        
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': `https://www.${platform}.com/`,
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            },
            timeout: 180000, // 3 minutes pour les vidéos HD
            maxRedirects: 10,
            maxContentLength: 100 * 1024 * 1024 // Max 100MB
        });
        
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            let downloadedSize = 0;
            
            response.data.on('data', (chunk) => {
                downloadedSize += chunk.length;
            });
            
            writer.on('finish', () => {
                const stats = fs.statSync(filepath);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                
                // Vérifier que le fichier n'est pas trop petit (erreur)
                if (stats.size < 10000) { // Moins de 10KB
                    fs.unlinkSync(filepath);
                    reject(new Error('Fichier téléchargé trop petit (probablement une erreur)'));
                    return;
                }
                
                console.log(`✅ Vidéo HD téléchargée: ${filename} (${fileSizeMB} MB)`);
                resolve(filepath);
            });
            
            writer.on('error', (error) => {
                console.error('❌ Erreur lors de l\'écriture du fichier:', error);
                
                // Nettoyer le fichier en cas d'erreur
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
                
                reject(new Error('Erreur lors du téléchargement de la vidéo'));
            });
            
            // Timeout de sécurité
            const timeout = setTimeout(() => {
                writer.close();
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
                reject(new Error('Timeout: le téléchargement a pris trop de temps'));
            }, 180000); // 3 minutes
            
            writer.on('finish', () => clearTimeout(timeout));
        });
        
    } catch (error) {
        console.error('❌ Erreur downloadFromUrl:', error.message);
        throw new Error('Échec du téléchargement de la vidéo: ' + error.message);
    }
}

// ===== NETTOYAGE FICHIERS ANCIENS =====
function cleanOldFiles() {
    try {
        const files = fs.readdirSync(DOWNLOAD_DIR);
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 heure
        
        let cleaned = 0;
        
        files.forEach(file => {
            const filepath = path.join(DOWNLOAD_DIR, file);
            
            try {
                const stats = fs.statSync(filepath);
                const age = now - stats.mtimeMs;
                
                if (age > maxAge) {
                    fs.unlinkSync(filepath);
                    cleaned++;
                    console.log(`🗑️ Fichier ancien supprimé: ${file}`);
                }
            } catch (err) {
                console.error(`Erreur suppression ${file}:`, err.message);
            }
        });
        
        if (cleaned > 0) {
            console.log(`✅ ${cleaned} fichier(s) ancien(s) nettoyé(s)`);
        }
        
    } catch (error) {
        console.error('Erreur nettoyage:', error.message);
    }
}

// Nettoyage automatique toutes les 30 minutes
setInterval(cleanOldFiles, 30 * 60 * 1000);

// Nettoyage au démarrage
cleanOldFiles();

// ===== EXPORTS =====
module.exports = {
    downloadVideo,
    downloadTikTok,
    downloadInstagram,
    downloadPinterest
};