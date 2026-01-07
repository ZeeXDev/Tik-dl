// ===== CONFIGURATION =====
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DOWNLOAD_DIR = path.join(__dirname, '../downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    console.log('📁 Dossier downloads créé');
}

// ===== FONCTION PRINCIPALE AMÉLIORÉE =====
async function downloadVideo(url, platform) {
    console.log(`🎬 Téléchargement ${platform}: ${url}`);
    
    // Toujours chercher la meilleure qualité
    try {
        switch (platform) {
            case 'tiktok':
                return await downloadTikTok_robust(url);
            case 'instagram':
                return await downloadInstagram_robust(url);
            case 'pinterest':
                return await downloadPinterest_robust(url);
            default:
                throw new Error('Plateforme non supportée');
        }
    } catch (error) {
        console.error(`❌ ERREUR CRITIQUE ${platform}:`, error.message);
        throw new Error(`Impossible de télécharger la vidéo. ${platform} a changé son API ou la vidéo est privée/supprimée.`);
    }
}

// ===== TIKTOK - Système de fallback avec 3 APIs =====
async function downloadTikTok_robust(url) {
    console.log('🔄 TIKTOK MODE ROBUSTE - Tentative API #1 (TikWM)');
    
    // API #1: TikWM (votre méthode actuelle)
    try {
        return await downloadTikTok_tikwm(url);
    } catch (error) {
        console.log('⚠️ TikWM échoué:', error.message);
        console.log('🔄 TIKTOK Tentative API #2 (MusicallyDown)');
    }
    
    // API #2: MusicallyDown (alternative populaire)
    try {
        return await downloadTikTok_musicallydown(url);
    } catch (error) {
        console.log('⚠️ MusicallyDown échoué:', error.message);
        console.log('🔄 TIKTOK Tentative API #3 (SnapTik)');
    }
    
    // API #3: SnapTik API (dernier recours)
    try {
        return await downloadTikTok_snaptik(url);
    } catch (error) {
        console.log('⚠️ SnapTik échoué:', error.message);
        throw new Error('Toutes les APIs TikTok sont indisponibles. La vidéo est peut-être privée ou le lien invalide.');
    }
}

// TikTok API #1: TikWM (inchangée)
async function downloadTikTok_tikwm(url) {
    const response = await axios.post('https://www.tikwm.com/api/', {
        url: url, hd: 1
    }, {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 30000
    });
    
    if (response.data.code !== 0) {
        throw new Error(`TikWM: ${response.data.msg || 'Erreur API'}`);
    }
    
    const data = response.data.data;
    const videoUrl = data.hdplay || data.play;
    
    if (!videoUrl) throw new Error('TikWM: URL vidéo non trouvée');
    
    console.log('✅ TikWM SUCCÈS - Qualité:', data.hdplay ? 'HD' : 'Standard');
    
    return {
        path: await downloadFromUrl(videoUrl, 'tiktok', data.hdplay ? 'HD' : 'SD'),
        caption: data.title || '',
        author: data.author?.nickname || 'Utilisateur TikTok',
        music: data.music || ''
    };
}

// TikTok API #2: MusicallyDown
async function downloadTikTok_musicallydown(url) {
    const response = await axios.post('https://musicallydown.com/download', new URLSearchParams({
        'url': url,
        'token': ''
    }), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://musicallydown.com',
            'Referer': 'https://musicallydown.com/'
        },
        timeout: 30000
    });
    
    // Chercher les URLs dans la réponse
    const videoMatch = response.data.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/);
    if (!videoMatch) throw new Error('MusicallyDown: URL non trouvée');
    
    console.log('✅ MusicallyDown SUCCÈS');
    
    return {
        path: await downloadFromUrl(videoMatch[1], 'tiktok', 'HD'),
        caption: response.data.match(/<p[^>]*>([^<]+)<\/p>/)?.[1] || '',
        author: 'Utilisateur TikTok',
        music: ''
    };
}

// TikTok API #3: SnapTik
async function downloadTikTok_snaptik(url) {
    const response = await axios.post('https://snaptik.app/api', {
        url: url
    }, {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 30000
    });
    
    if (!response.data.videoUrl) throw new Error('SnapTik: URL non reçue');
    
    console.log('✅ SnapTik SUCCÈS');
    
    return {
        path: await downloadFromUrl(response.data.videoUrl, 'tiktok', 'HD'),
        caption: response.data.caption || '',
        author: response.data.author || 'Utilisateur TikTok',
        music: ''
    };
}

// ===== INSTAGRAM - Système de fallback amélioré =====
async function downloadInstagram_robust(url) {
    console.log('🔄 INSTAGRAM MODE ROBUSTE - API #1');
    
    // API #1: InstaDownloader
    try {
        return await downloadInstagram_instaapi(url);
    } catch (error) {
        console.log('⚠️ InstaAPI échoué:', error.message);
        console.log('🔄 INSTAGRAM Tentative API #2 (Vidloder)');
    }
    
    // API #2: Vidloder (alternative)
    try {
        return await downloadInstagram_vidloder(url);
    } catch (error) {
        console.log('⚠️ Vidloder échoué:', error.message);
        throw new Error('Impossible de télécharger cette Instagram. Le compte est peut-être privé ou la vidéo a été supprimée.');
    }
}

// Instagram API #1: InstaDownloader (plus robuste)
async function downloadInstagram_instaapi(url) {
    const response = await axios.get('https://v3.igdownloader.app/api/ajaxSearch', {
        params: { recaptchaToken: '', q: url, t: 'media', lang: 'en' },
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Origin': 'https://igdownloader.app',
            'Referer': 'https://igdownloader.app/'
        },
        timeout: 25000
    });
    
    const html = response.data.data || response.data;
    
    // Chercher la meilleure qualité (priorité: HD > SD)
    const videoMatch = html.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/i) ||
                      html.match(/href="(https:\/\/[^"]+)"[^>]*class="[^"]*download[^"]*"/i);
    
    if (!videoMatch || !videoMatch[1]) throw new Error('InstaAPI: Aucune vidéo trouvée');
    
    // Extraire caption
    const caption = html.match(/<p[^>]*class="[^"]*desc[^"]*"[^>]*>([^<]+)<\/p>/i)?.[1]?.trim() || '';
    
    console.log('✅ InstaAPI SUCCÈS - Caption:', caption ? 'Oui' : 'Non');
    
    return {
        path: await downloadFromUrl(videoMatch[1], 'instagram', 'HD'),
        caption: caption
    };
}

// Instagram API #2: Vidloder
async function downloadInstagram_vidloder(url) {
    const response = await axios.post('https://vidloder.com/api', {
        url: url,
        type: 'instagram'
    }, {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        },
        timeout: 25000
    });
    
    if (!response.data.videoUrl) throw new Error('Vidloder: URL non reçue');
    
    console.log('✅ Vidloder SUCCÈS');
    
    return {
        path: await downloadFromUrl(response.data.videoUrl, 'instagram', 'HD'),
        caption: response.data.caption || ''
    };
}

// ===== PINTEREST - NOUVEAU système avec API dédiée =====
async function downloadPinterest_robust(url) {
    console.log('🔄 PINTEREST MODE ROBUSTE - API #1 (Pinterest API)');
    
    // API #1: Pinterest API directe (MEILLEURE MÉTHODE)
    try {
        return await downloadPinterest_api(url);
    } catch (error) {
        console.log('⚠️ Pinterest API échouée:', error.message);
        console.log('🔄 PINTEREST Tentative #2 (Scraping avancé)');
    }
    
    // Méthode #2: Scraping amélioré
    try {
        return await downloadPinterest_scraping(url);
    } catch (error) {
        console.log('⚠️ Scraping Pinterest échoué:', error.message);
        throw new Error('Impossible de télécharger cette vidéo Pinterest. Le lien est invalide ou contient une image.');
    }
}

// Pinterest API #1: API directe (très fiable)
async function downloadPinterest_api(url) {
    // Extraire l'ID de la pin
    const pinIdMatch = url.match(/pin\/(\d+)/) || url.match(/\/(\d+)(?:\/|$)/);
    if (!pinIdMatch) throw new Error('Pinterest: Pin ID non extrait');
    
    const pinId = pinIdMatch[1];
    console.log('📌 Pinterest Pin ID:', pinId);
    
    // Utiliser l'API non-officielle Pinterest
    const response = await axios.get(`https://www.pinterest.fr/resource/PinResource/get/`, {
        params: {
            'data': JSON.stringify({
                "options": {
                    "id": pinId,
                    "field_set_key": "unauth_react"
                }
            })
        },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'X-Requested-With': 'XMLHttpRequest',
            'X-APPLES': 'pleased',
            'Accept': 'application/json, text/javascript, */*; q=0.01'
        },
        timeout: 25000
    });
    
    const pinData = response.data?.resource_response?.data;
    if (!pinData) throw new Error('Pinterest: Données pin non reçues');
    
    // Vérifier que c'est bien une vidéo
    if (!pinData.videos) throw new Error('Pinterest: Ce n\'est pas une vidéo');
    
    // Chercher la meilleure qualité (V_720P > V_HLSV4 > premier disponible)
    const videoObj = pinData.videos.video_list.V_720P || 
                    pinData.videos.video_list.V_HLSV4 || 
                    Object.values(pinData.videos.video_list)[0];
    
    if (!videoObj?.url) throw new Error('Pinterest: URL vidéo non trouvée');
    
    const videoUrl = videoObj.url;
    const caption = pinData.description || pinData.title || '';
    
    console.log('✅ Pinterest API SUCCÈS - Qualité:', videoObj.format || 'HD');
    
    return {
        path: await downloadFromUrl(videoUrl, 'pinterest', 'HD'),
        caption: caption
    };
}

// Pinterest Méthode #2: Scraping amélioré
async function downloadPinterest_scraping(url) {
    // Résoudre les URLs raccourcies
    if (url.includes('pin.it')) {
        const resolve = await axios.get(url, { maxRedirects: 5, timeout: 15000 });
        url = resolve.request.res.responseUrl || url;
    }
    
    console.log('📌 Scraping URL Pinterest:', url);
    
    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 25000
    });
    
    // Chercher les données JSON dans le HTML (plus flexible)
    const jsonMatch = response.data.match(/<script id="__PWS_DATA__" type="application\/json">({.+?})<\/script>/s) ||
                     response.data.match(/window\.initial-redux-state\s*=\s*({.+});/s);
    
    if (!jsonMatch) throw new Error('Scraping: données JSON non trouvées');
    
    const data = JSON.parse(jsonMatch[1]);
    
    // Chercher le pin dans le JSON (parcours récursif)
    const pinData = findPinDataRecursively(data);
    if (!pinData?.videos) throw new Error('Scraping: vidéo non trouvée dans les données');
    
    const videoUrl = Object.values(pinData.videos.video_list)[0]?.url;
    if (!videoUrl) throw new Error('Scraping: URL vidéo non extraite');
    
    console.log('✅ Pinterest Scraping SUCCÈS');
    
    return {
        path: await downloadFromUrl(videoUrl, 'pinterest', 'HD'),
        caption: pinData.description || ''
    };
}

// Helper pour chercher pin dans JSON complexe
function findPinDataRecursively(obj) {
    if (typeof obj !== 'object' || !obj) return null;
    
    if (obj.videos && obj.id) return obj;
    
    for (const key in obj) {
        if (key.startsWith('pin-') && typeof obj[key] === 'object') {
            return obj[key];
        }
        const found = findPinDataRecursively(obj[key]);
        if (found) return found;
    }
    
    return null;
}

// ===== TÉLÉCHARGEMENT AMÉLIORÉ AVEC QUALITÉ =====
async function downloadFromUrl(videoUrl, platform, quality = 'HD') {
    try {
        const filename = `${platform}_${quality}_${Date.now()}.mp4`;
        const filepath = path.join(DOWNLOAD_DIR, filename);
        
        console.log(`⬇️ Téléchargement ${quality}...`);
        console.log('📎 URL:', videoUrl.substring(0, 100) + '...');
        
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': `https://www.${platform}.com/`,
                'Accept': '*/*'
            },
            timeout: 180000,
            maxRedirects: 10,
            maxContentLength: 200 * 1024 * 1024 // 200MB max (pour très HD)
        });
        
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            let downloadedSize = 0;
            let lastLog = Date.now();
            
            response.data.on('data', (chunk) => {
                downloadedSize += chunk.length;
                
                // Log progression toutes les 5s
                if (Date.now() - lastLog > 5000) {
                    console.log(`📥 Progression: ${(downloadedSize / 1024 / 1024).toFixed(2)} MB`);
                    lastLog = Date.now();
                }
            });
            
            writer.on('finish', () => {
                const stats = fs.statSync(filepath);
                const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
                
                // Vérifier taille minimale (au moins 50KB)
                if (stats.size < 50000) {
                    fs.unlinkSync(filepath);
                    reject(new Error(`Fichier trop petit (${fileSizeMB} MB) - probablement une erreur`));
                    return;
                }
                
                console.log(`✅ Vidéo ${quality} téléchargée: ${filename} (${fileSizeMB} MB)`);
                resolve(filepath);
            });
            
            writer.on('error', (error) => {
                if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
                reject(error);
            });
            
            // Timeout sécurité
            const timeout = setTimeout(() => {
                writer.close();
                if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
                reject(new Error('Timeout: 3 minutes écoulées'));
            }, 180000);
            
            writer.on('finish', () => clearTimeout(timeout));
        });
        
    } catch (error) {
        console.error('❌ Erreur downloadFromUrl:', error.message);
        throw error;
    }
}

// ===== NETTOYAGE (inchangé) =====
function cleanOldFiles() {
    try {
        const files = fs.readdirSync(DOWNLOAD_DIR);
        const now = Date.now();
        const maxAge = 60 * 60 * 1000;
        
        let cleaned = 0;
        files.forEach(file => {
            const filepath = path.join(DOWNLOAD_DIR, file);
            try {
                const stats = fs.statSync(filepath);
                if (now - stats.mtimeMs > maxAge) {
                    fs.unlinkSync(filepath);
                    cleaned++;
                    console.log(`🗑️ Fichier ancien supprimé: ${file}`);
                }
            } catch (err) {
                console.error(`Erreur suppression ${file}:`, err.message);
            }
        });
        
        if (cleaned > 0) console.log(`✅ ${cleaned} fichier(s) nettoyé(s)`);
    } catch (error) {
        console.error('Erreur nettoyage:', error.message);
    }
}

setInterval(cleanOldFiles, 30 * 60 * 1000);
cleanOldFiles();

// ===== EXPORTS =====
module.exports = {
    downloadVideo,
    downloadTikTok: downloadTikTok_robust,
    downloadInstagram: downloadInstagram_robust,
    downloadPinterest: downloadPinterest_robust
};
