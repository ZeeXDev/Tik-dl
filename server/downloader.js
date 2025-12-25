// ===== IMPORTS =====
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ===== CONFIGURATION =====
const DOWNLOAD_DIR = path.join(__dirname, '../downloads');
const LOG_FILE = path.join(__dirname, '../downloads/download_log.json');

// ===== USER AGENTS ROTATIFS =====
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Instagram 269.0.0.18.75 (iPhone14,3; iOS 17_1; en_US; en-US; scale=3.00; 1290x2796; 460736569)'
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ===== LOGGING AMÉLIORÉ =====
function logDownload(platform, url, success, error = null, fileSize = null) {
    try {
        const logEntry = {
            timestamp: new Date().toISOString(),
            platform,
            url: url.substring(0, 200), // Limiter la longueur
            success,
            error: error ? error.substring(0, 500) : null,
            fileSize,
            userAgent: getRandomUserAgent().substring(0, 100)
        };
        
        let logs = [];
        if (fs.existsSync(LOG_FILE)) {
            const data = fs.readFileSync(LOG_FILE, 'utf8');
            try {
                logs = JSON.parse(data);
            } catch (e) {
                logs = [];
            }
        }
        
        logs.push(logEntry);
        
        // Garder seulement les 100 derniers logs
        if (logs.length > 100) {
            logs = logs.slice(-100);
        }
        
        fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
        
    } catch (err) {
        console.error('Erreur logging:', err.message);
    }
}

// ===== VÉRIFICATION URL =====
function validateUrl(url, platform) {
    const patterns = {
        'tiktok': /tiktok\.com\/@[^\/]+\/video\/\d+|vm\.tiktok\.com\/[^\/]+|vt\.tiktok\.com\/[^\/]+/,
        'instagram': /instagram\.com\/(p|reel|reels)\/[^\/?]+/,
        'pinterest': /pinterest\.(com|fr)\/pin\/\d+|pin\.it\/[^\/]+/
    };
    
    if (!patterns[platform].test(url)) {
        throw new Error(`Format URL ${platform} invalide. Exemples:\n` +
            (platform === 'instagram' ? '- https://www.instagram.com/reel/Cxxxxxxxxxx/\n' : '') +
            (platform === 'pinterest' ? '- https://www.pinterest.com/pin/xxxxxxxxxxxxxxx/\n' : '') +
            (platform === 'tiktok' ? '- https://www.tiktok.com/@user/video/xxxxxxxxx/' : ''));
    }
    
    return true;
}

// Créer le dossier downloads s'il n'existe pas
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    console.log('📁 Dossier downloads créé');
}

// ===== FONCTION PRINCIPALE =====
async function downloadVideo(url, platform) {
    console.log(`🎬 Téléchargement ${platform}: ${url}`);
    
    try {
        // Valider l'URL
        validateUrl(url, platform);
        
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
        
        // Log du succès
        const fileSize = fs.existsSync(result.path) ? fs.statSync(result.path).size : null;
        logDownload(platform, url, true, null, fileSize);
        
        return result;
        
    } catch (error) {
        console.error(`❌ Erreur téléchargement ${platform}:`, error.message);
        
        // Log de l'erreur
        logDownload(platform, url, false, error.message);
        
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
                'User-Agent': getRandomUserAgent()
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

// ===== INSTAGRAM - GraphQL API (NOUVELLE MÉTHODE) =====
async function downloadInstagramGraphQL(url) {
    console.log('Tentative Instagram GraphQL API...');
    
    try {
        // Extraction de l'ID du post
        const postIdMatch = url.match(/\/(p|reel|reels)\/([^\/?]+)/);
        if (!postIdMatch) {
            throw new Error('Format URL Instagram invalide');
        }
        
        const postId = postIdMatch[2];
        
        // Plusieurs endpoints alternatifs
        const endpoints = [
            `https://www.instagram.com/p/${postId}/?__a=1&__d=dis`,
            `https://www.instagram.com/graphql/query/?query_hash=2b0673e0dc4580674a88d426fe00ea90&variables={"shortcode":"${postId}"}`,
            `https://i.instagram.com/api/v1/media/${postId}/info/`
        ];
        
        for (const endpoint of endpoints) {
            try {
                const response = await axios.get(endpoint, {
                    headers: {
                        'User-Agent': 'Instagram 269.0.0.18.75 (iPhone14,3; iOS 17_1; en_US; en-US; scale=3.00; 1290x2796; 460736569)',
                        'Accept': 'application/json',
                        'Accept-Language': 'en-US',
                        'X-IG-App-ID': '936619743392459',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    timeout: 15000
                });
                
                if (response.data) {
                    let videoUrl = null;
                    let caption = '';
                    
                    // Essayer différents formats de réponse
                    if (response.data.graphql) {
                        // Format GraphQL
                        const media = response.data.graphql.shortcode_media;
                        if (media.is_video && media.video_url) {
                            videoUrl = media.video_url;
                            caption = media.edge_media_to_caption?.edges[0]?.node?.text || '';
                        }
                    } else if (response.data.items) {
                        // Format API mobile
                        const item = response.data.items[0];
                        if (item.video_versions && item.video_versions[0]) {
                            videoUrl = item.video_versions[0].url;
                            caption = item.caption?.text || '';
                        }
                    } else if (response.data.video_url) {
                        // Format direct
                        videoUrl = response.data.video_url;
                    }
                    
                    if (videoUrl) {
                        console.log('✅ Instagram GraphQL réussi');
                        const videoPath = await downloadFromUrl(videoUrl, 'instagram');
                        return { path: videoPath, caption: caption };
                    }
                }
            } catch (err) {
                console.log(`Endpoint ${endpoint} échoué:`, err.message);
                continue;
            }
        }
        
        throw new Error('Aucun endpoint GraphQL ne fonctionne');
        
    } catch (error) {
        throw new Error('Instagram GraphQL: ' + error.message);
    }
}

// ===== INSTAGRAM - SaveFrom API =====
async function downloadInstagramSaveFrom(url) {
    try {
        console.log('Tentative SaveFrom API...');
        const response = await axios.post('https://saveig.app/api/ajaxSearch', 
            `q=${encodeURIComponent(url)}&t=media&lang=en`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': getRandomUserAgent()
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
                
                // Extraire la caption depuis le HTML
                const captionMatch = html.match(/<p[^>]*class="[^"]*desc[^"]*"[^>]*>([^<]+)<\/p>/i) ||
                                    html.match(/<div[^>]*class="[^"]*caption[^"]*"[^>]*>([^<]+)<\/div>/i);
                const caption = captionMatch ? captionMatch[1].trim() : '';
                
                console.log('✅ URL Instagram trouvée via SaveFrom');
                const videoPath = await downloadFromUrl(videoUrl, 'instagram');
                
                return { path: videoPath, caption: caption };
            }
        }
        
        throw new Error('URL non trouvée via SaveFrom');
        
    } catch (error) {
        throw new Error('SaveFrom: ' + error.message);
    }
}

// ===== INSTAGRAM - SnapInsta API =====
async function downloadInstagramSnapInsta(url) {
    try {
        console.log('Tentative SnapInsta API...');
        const response = await axios.post('https://snapinsta.app/api/ajaxSearch', 
            `q=${encodeURIComponent(url)}&t=media&lang=en`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': getRandomUserAgent(),
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
            
            // Extraire la caption
            const captionMatch = html.match(/<p[^>]*class="[^"]*desc[^"]*"[^>]*>([^<]+)<\/p>/i) ||
                                html.match(/<div[^>]*class="[^"]*caption[^"]*"[^>]*>([^<]+)<\/div>/i);
            const caption = captionMatch ? captionMatch[1].trim() : '';
            
            if (match && match[1]) {
                const videoUrl = match[1];
                console.log('✅ URL Instagram trouvée via SnapInsta');
                const videoPath = await downloadFromUrl(videoUrl, 'instagram');
                
                return { path: videoPath, caption: caption };
            }
        }
        
        throw new Error('URL non trouvée via SnapInsta');
        
    } catch (error) {
        throw new Error('SnapInsta: ' + error.message);
    }
}

// ===== INSTAGRAM - Scraping direct (fallback) =====
async function downloadInstagramScraping(url) {
    try {
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
        
    } catch (error) {
        throw new Error('Instagram scraping: ' + error.message);
    }
}

// ===== INSTAGRAM - MULTIPLES MÉTHODES AMÉLIORÉES =====
async function downloadInstagram(url) {
    console.log('📸 Téléchargement Instagram...');
    
    // Liste ordonnée des méthodes à essayer
    const methods = [
        { name: 'GraphQL', func: downloadInstagramGraphQL },
        { name: 'SaveFrom', func: downloadInstagramSaveFrom },
        { name: 'SnapInsta', func: downloadInstagramSnapInsta },
        { name: 'Scraping', func: downloadInstagramScraping }
    ];
    
    let lastError = null;
    
    for (const method of methods) {
        try {
            console.log(`Tentative ${method.name}...`);
            const result = await method.func(url);
            console.log(`✅ Instagram réussi via ${method.name}`);
            return result;
        } catch (error) {
            console.log(`❌ ${method.name} échoué:`, error.message);
            lastError = error;
            continue;
        }
    }
    
    throw new Error(`Impossible de télécharger cette vidéo Instagram. Raisons possibles:\n1. Vidéo privée\n2. Compte privé\n3. Vidéo supprimée\n4. URL incorrecte\n\nDernière erreur: ${lastError?.message}`);
}

// ===== PINTEREST - API alternative (NOUVELLE MÉTHODE) =====
async function downloadPinterestAPI(url) {
    console.log('Tentative Pinterest API...');
    
    try {
        // Essayer plusieurs APIs publiques
        const apis = [
            {
                name: 'SaveFromPinterest',
                url: 'https://pinterestvideodownloader.com/download',
                method: 'post',
                data: `url=${encodeURIComponent(url)}`,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': getRandomUserAgent()
                }
            },
            {
                name: 'PinterestDownloader',
                url: 'https://pindownloader.com/download',
                method: 'get',
                params: { url: url },
                headers: {
                    'User-Agent': getRandomUserAgent()
                }
            }
        ];
        
        for (const api of apis) {
            try {
                console.log(`Essai API ${api.name}...`);
                const response = await axios({
                    method: api.method,
                    url: api.url,
                    data: api.data,
                    params: api.params,
                    headers: api.headers,
                    timeout: 20000
                });
                
                // Chercher l'URL vidéo dans la réponse
                const videoPatterns = [
                    /href="([^"]*\.mp4[^"]*)"[^>]*download/i,
                    /"videoUrl":"([^"]+)"/,
                    /"url":"(https:\/\/v\.pinimg\.com[^"]+)"/,
                    /source src="([^"]+)" type="video\/mp4"/
                ];
                
                for (const pattern of videoPatterns) {
                    const match = response.data.toString().match(pattern);
                    if (match && match[1]) {
                        let videoUrl = match[1].replace(/\\\//g, '/').replace(/\\/g, '');
                        
                        // Extraire la description
                        const descMatch = response.data.toString().match(/description["']?\s*:\s*["']([^"']+)["']/i);
                        const caption = descMatch ? descMatch[1] : '';
                        
                        console.log(`✅ Pinterest API ${api.name} réussi`);
                        const videoPath = await downloadFromUrl(videoUrl, 'pinterest');
                        return { path: videoPath, caption: caption };
                    }
                }
            } catch (err) {
                console.log(`API ${api.name} échouée:`, err.message);
                continue;
            }
        }
        
        throw new Error('Aucune API Pinterest ne fonctionne');
        
    } catch (error) {
        throw new Error('Pinterest API: ' + error.message);
    }
}

// ===== PINTEREST - Scraping original =====
async function downloadPinterestScraping(url) {
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
                'User-Agent': getRandomUserAgent(),
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
        console.error('❌ Erreur Pinterest scraping:', error.message);
        throw new Error('Pinterest scraping: ' + error.message);
    }
}

// ===== PINTEREST - MULTIPLES MÉTHODES AMÉLIORÉES =====
async function downloadPinterest(url) {
    console.log('📌 Téléchargement Pinterest...');
    
    // Liste ordonnée des méthodes à essayer
    const methods = [
        { name: 'API', func: downloadPinterestAPI },
        { name: 'Scraping', func: downloadPinterestScraping }
    ];
    
    let lastError = null;
    
    for (const method of methods) {
        try {
            console.log(`Tentative ${method.name}...`);
            const result = await method.func(url);
            console.log(`✅ Pinterest réussi via ${method.name}`);
            return result;
        } catch (error) {
            console.log(`❌ ${method.name} échoué:`, error.message);
            lastError = error;
            continue;
        }
    }
    
    throw new Error(`Impossible de télécharger cette vidéo Pinterest. Vérifiez:\n1. Le lien contient une vidéo (pas une image)\n2. Le pin n'est pas supprimé\n3. Essayez avec l'URL complète, pas pin.it\n\nDernière erreur: ${lastError?.message}`);
}

// ===== TÉLÉCHARGER DEPUIS URL (AMÉLIORÉE) =====
async function downloadFromUrl(videoUrl, platform) {
    try {
        // Nettoyer l'URL
        videoUrl = videoUrl.replace(/\\\//g, '/').replace(/\\/g, '');
        
        console.log(`⬇️ Téléchargement depuis: ${videoUrl.substring(0, 100)}...`);
        
        const filename = `${platform}_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`;
        const filepath = path.join(DOWNLOAD_DIR, filename);
        
        // Headers dynamiques selon la plateforme
        const headers = {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'identity', // Important: désactiver gzip pour les vidéos
            'Connection': 'keep-alive',
            'Range': 'bytes=0-', // Support pour la reprise
        };
        
        // Referer spécifique à la plateforme
        if (platform === 'instagram') {
            headers['Referer'] = 'https://www.instagram.com/';
            headers['Origin'] = 'https://www.instagram.com';
        } else if (platform === 'pinterest') {
            headers['Referer'] = 'https://www.pinterest.com/';
            headers['Origin'] = 'https://www.pinterest.com';
        } else if (platform === 'tiktok') {
            headers['Referer'] = 'https://www.tiktok.com/';
            headers['Origin'] = 'https://www.tiktok.com';
        }
        
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: headers,
            timeout: 300000, // 5 minutes pour les grandes vidéos
            maxRedirects: 5,
            maxContentLength: 500 * 1024 * 1024, // Max 500MB
            validateStatus: (status) => status >= 200 && status < 400
        });
        
        const writer = fs.createWriteStream(filepath);
        let downloadedSize = 0;
        let lastProgress = 0;
        
        // Suivi de progression
        response.data.on('data', (chunk) => {
            downloadedSize += chunk.length;
            
            // Afficher la progression toutes les 5MB
            if (downloadedSize - lastProgress > 5 * 1024 * 1024) {
                const mb = (downloadedSize / (1024 * 1024)).toFixed(1);
                console.log(`📥 Téléchargement: ${mb} MB`);
                lastProgress = downloadedSize;
            }
        });
        
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                const stats = fs.statSync(filepath);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                
                // Vérifications de sécurité
                if (stats.size < 10240) { // Moins de 10KB
                    fs.unlinkSync(filepath);
                    reject(new Error('Fichier trop petit (probablement une page HTML d\'erreur)'));
                    return;
                }
                
                // Vérifier que c'est bien une vidéo (magic numbers)
                const buffer = Buffer.alloc(8);
                const fd = fs.openSync(filepath, 'r');
                fs.readSync(fd, buffer, 0, 8, 0);
                fs.closeSync(fd);
                
                const hex = buffer.toString('hex');
                const isMp4 = hex.startsWith('66747970') || hex.startsWith('000001ba') || hex.startsWith('000001b3');
                
                if (!isMp4 && stats.size < 1000000) { // Si petit et pas MP4
                    console.warn('⚠️ Le fichier ne semble pas être une vidéo MP4 valide');
                    // On ne rejette pas immédiatement, certaines vidéos peuvent avoir des headers différents
                }
                
                console.log(`✅ Vidéo téléchargée: ${filename} (${fileSizeMB} MB)`);
                resolve(filepath);
            });
            
            writer.on('error', (error) => {
                console.error('❌ Erreur écriture fichier:', error);
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
                reject(new Error(`Erreur écriture: ${error.message}`));
            });
            
            response.data.on('error', (error) => {
                console.error('❌ Erreur flux vidéo:', error);
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
                reject(new Error(`Erreur flux: ${error.message}`));
            });
            
            // Timeout de sécurité
            const timeout = setTimeout(() => {
                writer.close();
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
                reject(new Error('Timeout: téléchargement trop long (>5 minutes)'));
            }, 300000);
            
            writer.on('finish', () => clearTimeout(timeout));
            writer.on('error', () => clearTimeout(timeout));
        });
        
    } catch (error) {
        console.error('❌ Erreur downloadFromUrl:', error.message);
        
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Headers:`, error.response.headers);
        }
        
        throw new Error(`Échec téléchargement: ${error.message}`);
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
    downloadPinterest,
    validateUrl,
    logDownload
};