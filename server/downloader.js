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
        let result = null;
        
        switch (platform) {
            case 'tiktok':
                result = await downloadTikTok(url);
                break;
            case 'instagram':
                result = await downloadInstagram(url);
                break;
            case 'pinterest':
                result = await downloadPinterest(url);
                break;
            default:
                throw new Error('Plateforme non supportée');
        }
        
        return result;
        
    } catch (error) {
        console.error(`❌ Erreur téléchargement ${platform}:`, error.message);
        throw error;
    }
}

// ===== TIKTOK - HD avec TikWM API + Caption =====
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
        
        // Récupérer les données
        const data = response.data.data;
        
        // Priorité : HD > play (normal)
        const videoUrl = data.hdplay || data.play;
        
        if (!videoUrl) {
            throw new Error('URL vidéo TikTok non trouvée');
        }
        
        // Récupérer la légende/description
        const caption = data.title || '';
        const author = data.author?.nickname || data.author?.unique_id || 'Utilisateur TikTok';
        const music = data.music || '';
        
        console.log('✅ URL TikTok HD récupérée, téléchargement...');
        console.log('📝 Caption:', caption);
        
        // Télécharger la vidéo
        const videoPath = await downloadFromUrl(videoUrl, 'tiktok');
        
        return {
            path: videoPath,
            caption: caption,
            author: author,
            music: music
        };
        
    } catch (error) {
        console.error('❌ Erreur TikWM:', error.message);
        throw new Error('Impossible de télécharger cette vidéo TikTok. Le lien est peut-être invalide ou la vidéo a été supprimée.');
    }
}

// ===== INSTAGRAM - Multiple APIs avec fallback + Caption =====
async function downloadInstagram(url) {
    console.log('📸 Téléchargement Instagram...');
    
    let videoPath = null;
    let caption = '';
    
    // Méthode 1 : API Insta Downloader (NOUVELLE - La meilleure)
    try {
        console.log('Tentative API Insta Downloader...');
        const result = await downloadInstagramAPI(url);
        videoPath = result.path;
        caption = result.caption;
    } catch (error) {
        console.log('Insta Downloader échoué:', error.message);
    }
    
    // Méthode 2 : Direct scraping avec mobile user agent
    if (!videoPath) {
        try {
            console.log('Tentative scraping mobile Instagram...');
            const result = await downloadInstagramMobile(url);
            videoPath = result.path;
            caption = result.caption;
        } catch (error) {
            console.log('Scraping mobile échoué:', error.message);
        }
    }
    
    // Méthode 3 : Scraping desktop
    if (!videoPath) {
        try {
            console.log('Tentative scraping desktop Instagram...');
            const result = await downloadInstagramScraping(url);
            videoPath = result.path;
            caption = result.caption;
        } catch (error) {
            console.log('Scraping desktop échoué:', error.message);
        }
    }
    
    if (!videoPath) {
        throw new Error('Impossible de télécharger cette vidéo Instagram. Vérifiez que le compte n\'est pas privé et que c\'est bien une vidéo (Reel ou Post vidéo).');
    }
    
    return {
        path: videoPath,
        caption: caption || ''
    };
}

// Instagram - API Insta Downloader (NOUVELLE)
async function downloadInstagramAPI(url) {
    const response = await axios.get('https://v3.igdownloader.app/api/ajaxSearch', {
        params: {
            recaptchaToken: '',
            q: url,
            t: 'media',
            lang: 'en'
        },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Origin': 'https://igdownloader.app',
            'Referer': 'https://igdownloader.app/'
        },
        timeout: 20000
    });
    
    if (response.data && response.data.data) {
        const html = response.data.data;
        
        // Chercher l'URL vidéo
        const videoMatch = html.match(/href="([^"]+)"[^>]*class="[^"]*download[^"]*"/i) ||
                          html.match(/href="([^"]+)"[^>]*>.*?Download.*?Video/i);
        
        // Extraire la caption
        const captionMatch = html.match(/<p[^>]*class="[^"]*desc[^"]*"[^>]*>([^<]+)<\/p>/i);
        const caption = captionMatch ? captionMatch[1].trim() : '';
        
        if (videoMatch && videoMatch[1]) {
            const videoUrl = videoMatch[1];
            console.log('✅ URL Instagram trouvée via API');
            const videoPath = await downloadFromUrl(videoUrl, 'instagram');
            
            return { path: videoPath, caption: caption };
        }
    }
    
    throw new Error('URL non trouvée via API');
}

// Instagram - Scraping mobile (NOUVEAU - Plus efficace)
async function downloadInstagramMobile(url) {
    // Nettoyer l'URL
    let cleanUrl = url.replace(/\?.*$/, '');
    if (!cleanUrl.endsWith('/')) cleanUrl += '/';
    
    const response = await axios.get(cleanUrl, {
        headers: {
            'User-Agent': 'Instagram 76.0.0.15.395 Android (24/7.0; 640dpi; 1440x2560; samsung; SM-G930F; herolte; samsungexynos8890; en_US; 138226743)',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
            'Cookie': 'sessionid=;'
        },
        timeout: 30000
    });
    
    // Chercher les données JSON dans le HTML
    const scriptMatch = response.data.match(/<script type="application\/ld\+json">({[^<]+})<\/script>/);
    
    if (scriptMatch) {
        try {
            const data = JSON.parse(scriptMatch[1]);
            
            // Extraire caption
            const caption = data.articleBody || data.description || '';
            
            // Chercher l'URL vidéo
            const videoUrl = data.video?.contentUrl || 
                           data.contentUrl || 
                           data.embedUrl;
            
            if (videoUrl) {
                console.log('✅ URL trouvée via scraping mobile (JSON-LD)');
                const videoPath = await downloadFromUrl(videoUrl, 'instagram');
                return { path: videoPath, caption: caption };
            }
        } catch (e) {
            console.log('Erreur parsing JSON-LD:', e.message);
        }
    }
    
    // Fallback: chercher dans les meta tags
    const videoMetaMatch = response.data.match(/<meta property="og:video" content="([^"]+)"/i) ||
                          response.data.match(/<meta property="og:video:secure_url" content="([^"]+)"/i);
    
    const captionMetaMatch = response.data.match(/<meta property="og:description" content="([^"]+)"/i);
    const caption = captionMetaMatch ? captionMetaMatch[1] : '';
    
    if (videoMetaMatch && videoMetaMatch[1]) {
        const videoUrl = videoMetaMatch[1];
        console.log('✅ URL trouvée via meta tags');
        const videoPath = await downloadFromUrl(videoUrl, 'instagram');
        return { path: videoPath, caption: caption };
    }
    
    throw new Error('URL vidéo non trouvée (mobile scraping)');
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
    
    // Chercher la caption/description
    const captionMatch = response.data.match(/"edge_media_to_caption":\s*\{\s*"edges":\s*\[\s*\{\s*"node":\s*\{\s*"text":\s*"([^"]+)"/);
    const caption = captionMatch ? captionMatch[1].replace(/\\n/g, '\n').replace(/\\u[\dA-F]{4}/gi, '') : '';
    
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
            const videoPath = await downloadFromUrl(videoUrl, 'instagram');
            
            return { path: videoPath, caption: caption };
        }
    }
    
    throw new Error('URL vidéo non trouvée dans le HTML');
}

// ===== PINTEREST - Amélioré avec meilleure détection + Caption =====
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
        
        // Extraire la description/caption
        const descMatch = response.data.match(/"description":"([^"]+)"/);
        const caption = descMatch ? descMatch[1].replace(/\\n/g, '\n') : '';
        
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
                const videoPath = await downloadFromUrl(videoUrl, 'pinterest');
                
                return { path: videoPath, caption: caption };
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