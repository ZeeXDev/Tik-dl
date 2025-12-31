// ===== IMPORTS =====
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// ===== CONFIGURATION =====
const DOWNLOAD_DIR = path.join(__dirname, '../downloads');
const TEMP_DIR = path.join(__dirname, '../temp');

// Créer les dossiers s'ils n'existent pas
[DOWNLOAD_DIR, TEMP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Dossier créé: ${dir}`);
    }
});

// ===== VÉRIFIER FFMPEG =====
async function checkFFmpeg() {
    try {
        await execPromise('ffmpeg -version');
        return true;
    } catch (error) {
        console.warn('⚠️ FFmpeg non trouvé. Installez-le pour de meilleures qualités vidéo.');
        return false;
    }
}

let FFMPEG_AVAILABLE = false;
checkFFmpeg().then(available => {
    FFMPEG_AVAILABLE = available;
    if (available) {
        console.log('✅ FFmpeg détecté et prêt');
    }
});

// ===== FONCTION PRINCIPALE =====
async function downloadVideo(url, platform, options = {}) {
    console.log(`🎬 Téléchargement ${platform}: ${url}`);
    
    try {
        let result = null;
        
        switch (platform) {
            case 'tiktok':
                result = await downloadTikTok(url, options);
                break;
            case 'instagram':
                result = await downloadInstagram(url);
                break;
            case 'pinterest':
                result = await downloadPinterest(url);
                break;
            case 'youtube':
                result = await downloadYouTube(url, options);
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

// ===== YOUTUBE - Avec sélection de qualité =====
async function downloadYouTube(url, options = {}) {
    try {
        console.log('🎥 Téléchargement YouTube...');
        
        // Qualité demandée (par défaut 720p)
        const quality = options.quality || '720p';
        const format = options.format || 'mp4'; // mp4 ou mp3
        
        console.log(`📊 Qualité demandée: ${quality} (${format})`);
        
        // Méthode 1: yt-dlp (RECOMMANDÉ - meilleure qualité)
        if (await checkYtDlp()) {
            return await downloadYouTubeYtDlp(url, quality, format);
        }
        
        // Méthode 2: API externe (fallback)
        return await downloadYouTubeAPI(url, quality, format);
        
    } catch (error) {
        console.error('❌ Erreur YouTube:', error.message);
        throw new Error('Impossible de télécharger cette vidéo YouTube. Vérifiez le lien.');
    }
}

// YouTube - avec yt-dlp (MEILLEURE MÉTHODE)
async function checkYtDlp() {
    try {
        await execPromise('yt-dlp --version');
        return true;
    } catch (error) {
        console.log('⚠️ yt-dlp non installé, utilisation API externe...');
        return false;
    }
}

async function downloadYouTubeYtDlp(url, quality, format) {
    const filename = `youtube_${Date.now()}`;
    const outputPath = path.join(DOWNLOAD_DIR, filename);
    
    let command;
    
    if (format === 'mp3') {
        // Télécharger en MP3
        command = `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${outputPath}.%(ext)s" "${url}"`;
    } else {
        // Télécharger vidéo avec qualité spécifique
        const qualityMap = {
            '2160p': 'bestvideo[height<=2160]+bestaudio/best[height<=2160]',
            '1440p': 'bestvideo[height<=1440]+bestaudio/best[height<=1440]',
            '1080p': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
            '720p': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
            '480p': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
            '360p': 'bestvideo[height<=360]+bestaudio/best[height<=360]'
        };
        
        const formatSelector = qualityMap[quality] || qualityMap['720p'];
        command = `yt-dlp -f "${formatSelector}" --merge-output-format mp4 -o "${outputPath}.%(ext)s" "${url}"`;
    }
    
    console.log('⬇️ Téléchargement avec yt-dlp...');
    
    try {
        const { stdout } = await execPromise(command, { 
            maxBuffer: 1024 * 1024 * 10,
            timeout: 300000 // 5 minutes
        });
        
        // Trouver le fichier téléchargé
        const files = fs.readdirSync(DOWNLOAD_DIR);
        const downloadedFile = files.find(f => f.startsWith(filename));
        
        if (!downloadedFile) {
            throw new Error('Fichier téléchargé introuvable');
        }
        
        const finalPath = path.join(DOWNLOAD_DIR, downloadedFile);
        const stats = fs.statSync(finalPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        console.log(`✅ YouTube téléchargé: ${downloadedFile} (${fileSizeMB} MB)`);
        
        // Extraire les métadonnées
        const titleMatch = stdout.match(/\[download\] Destination: (.+)/);
        const title = titleMatch ? path.basename(titleMatch[1], path.extname(titleMatch[1])) : 'Video YouTube';
        
        return {
            path: finalPath,
            caption: title,
            quality: quality,
            format: format
        };
        
    } catch (error) {
        throw new Error('Erreur yt-dlp: ' + error.message);
    }
}

// YouTube - API externe (fallback)
async function downloadYouTubeAPI(url, quality, format) {
    try {
        // Extraire l'ID de la vidéo
        const videoId = extractYouTubeId(url);
        if (!videoId) {
            throw new Error('ID vidéo YouTube invalide');
        }
        
        console.log('🔍 Recherche des formats disponibles...');
        
        // Utiliser l'API Co-Cobalt (gratuite et sans watermark)
        const response = await axios.post('https://api.cobalt.tools/api/json', {
            url: url,
            vCodec: 'h264',
            vQuality: quality.replace('p', ''),
            aFormat: format === 'mp3' ? 'mp3' : 'best',
            isAudioOnly: format === 'mp3'
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        if (response.data.status === 'error') {
            throw new Error(response.data.text || 'Erreur API Cobalt');
        }
        
        const downloadUrl = response.data.url;
        if (!downloadUrl) {
            throw new Error('URL de téléchargement non disponible');
        }
        
        console.log('✅ URL YouTube récupérée, téléchargement...');
        
        const extension = format === 'mp3' ? 'mp3' : 'mp4';
        const videoPath = await downloadFromUrl(downloadUrl, 'youtube', extension);
        
        return {
            path: videoPath,
            caption: response.data.filename || 'Video YouTube',
            quality: quality,
            format: format
        };
        
    } catch (error) {
        console.error('❌ Erreur API YouTube:', error.message);
        throw new Error('Impossible de télécharger via API. Installez yt-dlp pour de meilleurs résultats.');
    }
}

function extractYouTubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\/\s]{11})/,
        /^([^&?\/\s]{11})$/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    
    return null;
}

// ===== TIKTOK - HD avec TikWM API + FFmpeg pour qualité maximale =====
async function downloadTikTok(url, options = {}) {
    try {
        console.log('🎵 Utilisation TikWM API (HD, sans watermark)...');
        
        const response = await axios.post('https://www.tikwm.com/api/', {
            url: url,
            hd: 1
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
        
        const data = response.data.data;
        const videoUrl = data.hdplay || data.play;
        
        if (!videoUrl) {
            throw new Error('URL vidéo TikTok non trouvée');
        }
        
        const caption = data.title || '';
        const author = data.author?.nickname || data.author?.unique_id || 'Utilisateur TikTok';
        const music = data.music || '';
        
        console.log('✅ URL TikTok HD récupérée');
        console.log('📝 Caption:', caption);
        
        // Télécharger la vidéo
        let videoPath = await downloadFromUrl(videoUrl, 'tiktok');
        
        // Si FFmpeg est disponible, optimiser la qualité
        if (FFMPEG_AVAILABLE && options.optimize !== false) {
            console.log('🎨 Optimisation avec FFmpeg...');
            videoPath = await optimizeVideoWithFFmpeg(videoPath, 'tiktok');
        }
        
        return {
            path: videoPath,
            caption: caption,
            author: author,
            music: music
        };
        
    } catch (error) {
        console.error('❌ Erreur TikWM:', error.message);
        throw new Error('Impossible de télécharger cette vidéo TikTok.');
    }
}

// ===== OPTIMISER VIDÉO AVEC FFMPEG =====
async function optimizeVideoWithFFmpeg(inputPath, platform) {
    try {
        const outputPath = inputPath.replace('.mp4', '_optimized.mp4');
        
        // Paramètres FFmpeg pour qualité maximale
        let command;
        
        if (platform === 'tiktok') {
            // Pour TikTok: conserver qualité HD, optimiser compression
            command = `ffmpeg -i "${inputPath}" -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k -movflags +faststart "${outputPath}" -y`;
        } else {
            // Pour autres plateformes: qualité élevée générale
            command = `ffmpeg -i "${inputPath}" -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 128k -movflags +faststart "${outputPath}" -y`;
        }
        
        console.log('🔄 Optimisation en cours...');
        
        await execPromise(command, {
            maxBuffer: 1024 * 1024 * 50,
            timeout: 180000
        });
        
        // Vérifier que l'optimisation a réussi
        if (fs.existsSync(outputPath)) {
            const inputStats = fs.statSync(inputPath);
            const outputStats = fs.statSync(outputPath);
            
            const inputSizeMB = (inputStats.size / (1024 * 1024)).toFixed(2);
            const outputSizeMB = (outputStats.size / (1024 * 1024)).toFixed(2);
            
            console.log(`✅ Vidéo optimisée: ${inputSizeMB}MB → ${outputSizeMB}MB`);
            
            // Supprimer l'original
            fs.unlinkSync(inputPath);
            
            return outputPath;
        } else {
            console.warn('⚠️ Optimisation échouée, utilisation vidéo originale');
            return inputPath;
        }
        
    } catch (error) {
        console.error('⚠️ Erreur FFmpeg:', error.message);
        console.log('Utilisation de la vidéo originale...');
        return inputPath;
    }
}

// ===== INSTAGRAM - Multiple APIs avec fallback + Caption =====
async function downloadInstagram(url) {
    console.log('📸 Téléchargement Instagram...');
    
    let videoPath = null;
    let caption = '';
    
    // Méthode 1 : SaveFrom API
    try {
        console.log('Tentative SaveFrom API...');
        const result = await downloadInstagramSaveFrom(url);
        videoPath = result.path;
        caption = result.caption;
    } catch (error) {
        console.log('SaveFrom échoué:', error.message);
    }
    
    // Méthode 2 : SnapInsta API
    if (!videoPath) {
        try {
            console.log('Tentative SnapInsta API...');
            const result = await downloadInstagramSnapInsta(url);
            videoPath = result.path;
            caption = result.caption;
        } catch (error) {
            console.log('SnapInsta échoué:', error.message);
        }
    }
    
    // Méthode 3 : Scraping direct
    if (!videoPath) {
        try {
            console.log('Tentative scraping Instagram...');
            const result = await downloadInstagramScraping(url);
            videoPath = result.path;
            caption = result.caption;
        } catch (error) {
            console.log('Scraping échoué:', error.message);
        }
    }
    
    if (!videoPath) {
        throw new Error('Impossible de télécharger cette vidéo Instagram.');
    }
    
    return {
        path: videoPath,
        caption: caption || ''
    };
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
        const html = response.data.data;
        const match = html.match(/href="([^"]+)"[^>]*download[^>]*>.*?Download/i);
        
        if (match && match[1]) {
            const videoUrl = match[1];
            const captionMatch = html.match(/<p[^>]*class="[^"]*desc[^"]*"[^>]*>([^<]+)<\/p>/i);
            const caption = captionMatch ? captionMatch[1].trim() : '';
            
            console.log('✅ URL Instagram trouvée via SaveFrom');
            const videoPath = await downloadFromUrl(videoUrl, 'instagram');
            
            return { path: videoPath, caption: caption };
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 20000
        }
    );
    
    if (response.data && response.data.data) {
        const html = response.data.data;
        const hdMatch = html.match(/href="([^"]+)"[^>]*>.*?HD.*?<\/a>/i);
        const normalMatch = html.match(/href="([^"]+)"[^>]*download[^>]*>/i);
        const match = hdMatch || normalMatch;
        
        const captionMatch = html.match(/<p[^>]*class="[^"]*desc[^"]*"[^>]*>([^<]+)<\/p>/i);
        const caption = captionMatch ? captionMatch[1].trim() : '';
        
        if (match && match[1]) {
            console.log('✅ URL Instagram trouvée via SnapInsta');
            const videoPath = await downloadFromUrl(match[1], 'instagram');
            return { path: videoPath, caption: caption };
        }
    }
    
    throw new Error('URL non trouvée via SnapInsta');
}

// Instagram - Scraping direct
async function downloadInstagramScraping(url) {
    let cleanUrl = url;
    if (url.includes('?')) cleanUrl = url.split('?')[0];
    if (!cleanUrl.endsWith('/')) cleanUrl += '/';
    
    const response = await axios.get(cleanUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
            'Accept': 'text/html,application/xhtml+xml'
        },
        timeout: 30000
    });
    
    const captionMatch = response.data.match(/"edge_media_to_caption":\s*\{\s*"edges":\s*\[\s*\{\s*"node":\s*\{\s*"text":\s*"([^"]+)"/);
    const caption = captionMatch ? captionMatch[1].replace(/\\n/g, '\n') : '';
    
    const patterns = [
        /"video_url":"([^"]+)"/,
        /"playback_url":"([^"]+)"/,
        /"src":"([^"]*\.mp4[^"]*)"/
    ];
    
    for (const pattern of patterns) {
        const match = response.data.match(pattern);
        if (match && match[1]) {
            let videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
            console.log('✅ URL vidéo trouvée via scraping');
            const videoPath = await downloadFromUrl(videoUrl, 'instagram');
            return { path: videoPath, caption: caption };
        }
    }
    
    throw new Error('URL vidéo non trouvée');
}

// ===== PINTEREST =====
async function downloadPinterest(url) {
    try {
        console.log('📌 Scraping Pinterest...');
        
        let cleanUrl = url;
        if (url.includes('pin.it')) {
            const response = await axios.get(url, { maxRedirects: 5, validateStatus: () => true });
            cleanUrl = response.request.res.responseUrl || url;
        }
        
        const response = await axios.get(cleanUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
        
        const descMatch = response.data.match(/"description":"([^"]+)"/);
        const caption = descMatch ? descMatch[1].replace(/\\n/g, '\n') : '';
        
        const patterns = [
            /"contentUrl":"([^"]+)"/,
            /"video_list":\s*\{[^}]*"V_720P":\s*\{[^}]*"url":"([^"]+)"/,
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
        
        throw new Error('URL vidéo Pinterest non trouvée');
        
    } catch (error) {
        throw new Error('Impossible de télécharger cette vidéo Pinterest.');
    }
}

// ===== TÉLÉCHARGER DEPUIS URL =====
async function downloadFromUrl(videoUrl, platform, extension = 'mp4') {
    try {
        const filename = `${platform}_${Date.now()}.${extension}`;
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
            timeout: 180000,
            maxRedirects: 10,
            maxContentLength: 200 * 1024 * 1024 // Max 200MB
        });
        
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                const stats = fs.statSync(filepath);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                
                if (stats.size < 10000) {
                    fs.unlinkSync(filepath);
                    reject(new Error('Fichier téléchargé trop petit'));
                    return;
                }
                
                console.log(`✅ Vidéo téléchargée: ${filename} (${fileSizeMB} MB)`);
                resolve(filepath);
            });
            
            writer.on('error', (error) => {
                if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
                reject(new Error('Erreur téléchargement'));
            });
            
            const timeout = setTimeout(() => {
                writer.close();
                if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
                reject(new Error('Timeout'));
            }, 180000);
            
            writer.on('finish', () => clearTimeout(timeout));
        });
        
    } catch (error) {
        throw new Error('Échec du téléchargement: ' + error.message);
    }
}

// ===== NETTOYAGE FICHIERS ANCIENS =====
function cleanOldFiles() {
    try {
        [DOWNLOAD_DIR, TEMP_DIR].forEach(dir => {
            const files = fs.readdirSync(dir);
            const now = Date.now();
            const maxAge = 60 * 60 * 1000; // 1 heure
            
            let cleaned = 0;
            
            files.forEach(file => {
                const filepath = path.join(dir, file);
                try {
                    const stats = fs.statSync(filepath);
                    if (now - stats.mtimeMs > maxAge) {
                        fs.unlinkSync(filepath);
                        cleaned++;
                    }
                } catch (err) {}
            });
            
            if (cleaned > 0) {
                console.log(`✅ ${cleaned} fichier(s) nettoyé(s) dans ${path.basename(dir)}`);
            }
        });
    } catch (error) {
        console.error('Erreur nettoyage:', error.message);
    }
}

setInterval(cleanOldFiles, 30 * 60 * 1000);
cleanOldFiles();

// ===== EXPORTS =====
module.exports = {
    downloadVideo,
    downloadTikTok,
    downloadInstagram,
    downloadPinterest,
    downloadYouTube
};