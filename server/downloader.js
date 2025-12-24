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

// ===== TIKTOK - GRATUIT avec TikWM API =====
async function downloadTikTok(url) {
    try {
        console.log('🎵 Utilisation TikWM API (gratuit, sans watermark)...');
        
        const response = await axios.post('https://www.tikwm.com/api/', {
            url: url,
            hd: 1
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: 30000
        });
        
        if (response.data.code !== 0) {
            throw new Error('Erreur API TikWM: ' + response.data.msg);
        }
        
        const videoUrl = response.data.data.play;
        
        if (!videoUrl) {
            throw new Error('URL vidéo TikTok non trouvée');
        }
        
        console.log('✅ URL TikTok récupérée, téléchargement...');
        
        // Télécharger la vidéo
        return await downloadFromUrl(videoUrl, 'tiktok');
        
    } catch (error) {
        console.error('❌ Erreur TikWM:', error.message);
        throw new Error('Impossible de télécharger cette vidéo TikTok. Vérifiez que le lien est valide et public.');
    }
}

// ===== INSTAGRAM - GRATUIT avec InstaDownloader API =====
async function downloadInstagram(url) {
    try {
        console.log('📸 Utilisation InstaDownloader API (gratuit)...');
        
        const response = await axios.get('https://api.instadownloader.com/media', {
            params: { url: url },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
        
        const videoUrl = response.data.download_url || response.data.video_url || response.data.url;
        
        if (!videoUrl) {
            console.log('⚠️ InstaDownloader n\'a pas fonctionné, essai avec scraping...');
            return await downloadInstagramScraping(url);
        }
        
        console.log('✅ URL Instagram récupérée, téléchargement...');
        
        return await downloadFromUrl(videoUrl, 'instagram');
        
    } catch (error) {
        console.error('❌ Erreur InstaDownloader:', error.message);
        
        // Fallback: scraping direct
        try {
            console.log('🔄 Tentative de scraping Instagram...');
            return await downloadInstagramScraping(url);
        } catch (err) {
            throw new Error('Impossible de télécharger cette vidéo Instagram. Vérifiez que le compte n\'est pas privé.');
        }
    }
}

// ===== INSTAGRAM - Scraping Fallback =====
async function downloadInstagramScraping(url) {
    try {
        console.log('📸 Scraping direct Instagram...');
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 30000
        });
        
        // Chercher l'URL vidéo dans le HTML
        let videoMatch = response.data.match(/"video_url":"([^"]+)"/);
        
        if (!videoMatch) {
            // Essayer un autre pattern
            videoMatch = response.data.match(/"playbackUrl":"([^"]+)"/);
        }
        
        if (videoMatch) {
            let videoUrl = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
            console.log('✅ URL vidéo trouvée via scraping');
            return await downloadFromUrl(videoUrl, 'instagram');
        }
        
        throw new Error('URL vidéo non trouvée dans le HTML');
        
    } catch (error) {
        console.error('❌ Erreur scraping Instagram:', error.message);
        throw error;
    }
}

// ===== PINTEREST - GRATUIT avec scraping =====
async function downloadPinterest(url) {
    try {
        console.log('📌 Scraping Pinterest...');
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 30000
        });
        
        // Méthode 1: Chercher contentUrl
        let videoMatch = response.data.match(/"contentUrl":"([^"]+)"/);
        
        if (!videoMatch) {
            // Méthode 2: Chercher video_list avec qualité V_720P
            videoMatch = response.data.match(/"video_list":\s*\{[^}]*"V_720P":\s*\{[^}]*"url":"([^"]+)"/);
        }
        
        if (!videoMatch) {
            // Méthode 3: Chercher videos avec différentes qualités
            videoMatch = response.data.match(/"videos":\s*\{[^}]*"video_list":\s*\{[^}]*"V_\w+":\s*\{[^}]*"url":"([^"]+)"/);
        }
        
        if (videoMatch) {
            let videoUrl = videoMatch[1].replace(/\\/g, '');
            console.log('✅ URL Pinterest récupérée, téléchargement...');
            return await downloadFromUrl(videoUrl, 'pinterest');
        }
        
        throw new Error('URL vidéo Pinterest non trouvée dans le HTML');
        
    } catch (error) {
        console.error('❌ Erreur Pinterest:', error.message);
        throw new Error('Impossible de télécharger cette vidéo Pinterest. Vérifiez que le lien contient bien une vidéo.');
    }
}

// ===== TÉLÉCHARGER DEPUIS URL =====
async function downloadFromUrl(videoUrl, platform) {
    try {
        const filename = `${platform}_${Date.now()}.mp4`;
        const filepath = path.join(DOWNLOAD_DIR, filename);
        
        console.log(`⬇️ Téléchargement de la vidéo...`);
        
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': `https://www.${platform}.com/`,
                'Accept': '*/*'
            },
            timeout: 120000, // 2 minutes
            maxRedirects: 5
        });
        
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                const stats = fs.statSync(filepath);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                console.log(`✅ Vidéo téléchargée: ${filename} (${fileSizeMB} MB)`);
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
            setTimeout(() => {
                writer.close();
                reject(new Error('Timeout: le téléchargement a pris trop de temps'));
            }, 120000);
        });
        
    } catch (error) {
        console.error('❌ Erreur downloadFromUrl:', error.message);
        throw new Error('Échec du téléchargement de la vidéo');
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