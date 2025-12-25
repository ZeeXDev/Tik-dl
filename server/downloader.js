// ===== IMPORTS =====
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// ===== CONFIGURATION =====
const DOWNLOAD_DIR = path.join(__dirname, '../downloads');

// Créer le dossier downloads s'il n'existe pas
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    console.log('📁 Dossier downloads créé');
}

// ===== DÉTECTION AUTOMATIQUE DE PLATEFORME =====
function detectPlatform(url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('tiktok.com') || urlLower.includes('vt.tiktok.com')) {
        return 'tiktok';
    } else if (urlLower.includes('instagram.com') || urlLower.includes('instagr.am')) {
        return 'instagram';
    } else if (urlLower.includes('pinterest.com') || urlLower.includes('pin.it')) {
        return 'pinterest';
    } else if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
        return 'youtube';
    } else if (urlLower.includes('facebook.com') || urlLower.includes('fb.watch')) {
        return 'facebook';
    } else if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
        return 'twitter';
    }
    return 'unknown';
}

// ===== FONCTION PRINCIPALE =====
async function downloadVideo(url, platform = null) {
    // Si platform n'est pas fourni, détecter automatiquement
    const detectedPlatform = platform || detectPlatform(url);
    
    console.log(`🎬 Téléchargement ${detectedPlatform}: ${url}`);
    
    if (detectedPlatform === 'unknown') {
        throw new Error('Plateforme non reconnue. Veuillez spécifier manuellement (tiktok, instagram, pinterest)');
    }
    
    try {
        let result = null;
        
        switch (detectedPlatform) {
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
        console.error(`❌ Erreur téléchargement ${detectedPlatform}:`, error.message);
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

// ===== INSTAGRAM - Version améliorée avec SaveGram + multiple APIs =====
async function downloadInstagram(url) {
    console.log('📸 Téléchargement Instagram...');
    
    let videoPath = null;
    let caption = '';
    let author = '';
    
    // Liste des méthodes à essayer (dans l'ordre)
    const methods = [
        { name: 'SaveGram API', func: downloadViaSaveGram },
        { name: 'Instagram URL Direct', func: downloadViaInstagramURLDirect },
        { name: 'SnapInsta API', func: downloadViaSnapInsta },
        { name: 'DDInstagram API', func: downloadViaDDInstagram },
        { name: 'Scraping Meta Tags', func: downloadViaMetaTags }
    ];
    
    // Essayer chaque méthode jusqu'à ce qu'une fonctionne
    for (const method of methods) {
        try {
            console.log(`🔄 Essai: ${method.name}...`);
            const result = await method.func(url);
            
            if (result && result.path) {
                videoPath = result.path;
                caption = result.caption || '';
                author = result.author || '';
                console.log(`✅ Succès avec ${method.name}!`);
                break;
            }
        } catch (error) {
            console.log(`❌ ${method.name} échoué: ${error.message}`);
            continue;
        }
    }
    
    if (!videoPath) {
        throw new Error('Impossible de télécharger cette vidéo Instagram. Vérifiez que:\n• Le lien est valide\n• Le compte n\'est pas privé\n• C\'est bien une vidéo/Reel');
    }
    
    return {
        path: videoPath,
        caption: caption,
        author: author
    };
}

// ===== MÉTHODE 1: SaveGram (Très fiable) =====
async function downloadViaSaveGram(url) {
    try {
        const response = await axios.get(`https://savegram.app/api/ajaxSearch`, {
            params: {
                url: url,
                lang: 'fr'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://savegram.app/'
            },
            timeout: 15000
        });
        
        if (response.data && response.data.data) {
            const html = response.data.data;
            
            // Chercher le bouton de téléchargement
            const videoMatch = html.match(/href="([^"]+\.mp4[^"]*)"[^>]*download/i) ||
                             html.match(/href="([^"]+)"[^>]*class="[^"]*download-btn[^"]*"/i);
            
            if (videoMatch && videoMatch[1]) {
                const videoUrl = videoMatch[1].replace(/&amp;/g, '&');
                const videoPath = await downloadFromUrl(videoUrl, 'instagram');
                
                // Extraire caption
                const captionMatch = html.match(/<div[^>]*class="[^"]*caption[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
                const caption = captionMatch ? captionMatch[1].replace(/<[^>]*>/g, '').trim() : '';
                
                // Extraire auteur
                const authorMatch = html.match(/<div[^>]*class="[^"]*username[^"]*"[^>]*>([^<]+)</i);
                const author = authorMatch ? authorMatch[1].trim() : '';
                
                return { path: videoPath, caption: caption, author: author };
            }
        }
        throw new Error('Aucune vidéo trouvée via SaveGram');
    } catch (error) {
        throw new Error(`SaveGram: ${error.message}`);
    }
}

// ===== MÉTHODE 2: Instagram URL Direct (Module npm) =====
async function downloadViaInstagramURLDirect(url) {
    try {
        // Charger dynamiquement pour éviter les erreurs si module non installé
        const { fromUrl } = require('instagram-url-direct');
        const links = await fromUrl(url);
        
        if (!links || links.length === 0) {
            throw new Error('Aucun média trouvé');
        }
        
        // Prendre la vidéo avec la meilleure qualité
        const videoLinks = links.filter(item => 
            item.type === 'video' || item.type === 'reel' || 
            (item.url && item.url.includes('.mp4')) ||
            (item.download && item.download.includes('.mp4'))
        );
        
        if (videoLinks.length === 0) {
            throw new Error('Pas de vidéo trouvée');
        }
        
        // Prendre la meilleure qualité
        const bestQuality = videoLinks.reduce((best, current) => {
            const currentQuality = parseInt(current.quality) || 0;
            const bestQuality = parseInt(best.quality) || 0;
            return currentQuality > bestQuality ? current : best;
        });
        
        const videoUrl = bestQuality.url || bestQuality.download;
        const videoPath = await downloadFromUrl(videoUrl, 'instagram');
        
        return { 
            path: videoPath, 
            caption: bestQuality.caption || '',
            author: bestQuality.author || bestQuality.username || ''
        };
    } catch (error) {
        throw new Error(`InstagramURLDirect: ${error.message}`);
    }
}

// ===== MÉTHODE 3: SnapInsta API =====
async function downloadViaSnapInsta(url) {
    try {
        const response = await axios.post('https://snapinsta.app/api/ajaxSearch', 
            `q=${encodeURIComponent(url)}&lang=fr&t=media`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': 'https://snapinsta.app/',
                    'Origin': 'https://snapinsta.app'
                },
                timeout: 15000
            }
        );
        
        if (response.data && response.data.data) {
            const html = response.data.data;
            
            // Chercher le lien de téléchargement
            const videoMatch = html.match(/href="([^"]+\.mp4[^"]*)"[^>]*download/i) ||
                             html.match(/href="([^"]+)"[^>]*class="[^"]*download[^"]*"/i);
            
            if (videoMatch && videoMatch[1]) {
                const videoUrl = videoMatch[1].replace(/&amp;/g, '&');
                const videoPath = await downloadFromUrl(videoUrl, 'instagram');
                
                // Extraire caption avec Cheerio
                const $ = cheerio.load(html);
                const caption = $('.video-title').text() || 
                               $('.caption').text() || 
                               $('.desc').text() || '';
                
                // Extraire auteur
                const author = $('.username').text() || 
                              $('.author').text() || '';
                
                return { 
                    path: videoPath, 
                    caption: caption.trim(),
                    author: author.trim()
                };
            }
        }
        throw new Error('Aucune vidéo trouvée via SnapInsta');
    } catch (error) {
        throw new Error(`SnapInsta: ${error.message}`);
    }
}

// ===== MÉTHODE 4: DDInstagram API =====
async function downloadViaDDInstagram(url) {
    try {
        // Extraire l'identifiant du post
        const postId = url.split('/').filter(part => part.length > 0).pop();
        const ddUrl = `https://ddinstagram.com/p/${postId}`;
        
        const response = await axios.get(ddUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 15000
        });
        
        // Chercher la vidéo dans le HTML
        const videoMatch = response.data.match(/<video[^>]*src="([^"]+)"/i) ||
                          response.data.match(/<source[^>]*src="([^"]+\.mp4[^"]*)"/i);
        
        if (videoMatch && videoMatch[1]) {
            const videoUrl = videoMatch[1];
            
            // Vérifier si c'est une URL relative
            const fullVideoUrl = videoUrl.startsWith('http') ? videoUrl : `https://ddinstagram.com${videoUrl}`;
            
            const videoPath = await downloadFromUrl(fullVideoUrl, 'instagram');
            
            // Extraire caption
            const captionMatch = response.data.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) ||
                                response.data.match(/<title>([^<]+)<\/title>/i);
            const caption = captionMatch ? captionMatch[1] : '';
            
            // Extraire auteur
            const authorMatch = response.data.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
            const author = authorMatch ? authorMatch[1].replace(' on Instagram', '') : '';
            
            return { path: videoPath, caption: caption, author: author };
        }
        throw new Error('Vidéo non trouvée via DDInstagram');
    } catch (error) {
        throw new Error(`DDInstagram: ${error.message}`);
    }
}

// ===== MÉTHODE 5: Scraping Meta Tags (Fallback) =====
async function downloadViaMetaTags(url) {
    try {
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
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 20000
        });
        
        // Chercher les meta tags Open Graph
        const videoMatch = response.data.match(/<meta[^>]*property="og:video"[^>]*content="([^"]+)"/i) ||
                          response.data.match(/<meta[^>]*property="og:video:secure_url"[^>]*content="([^"]+)"/i);
        
        const captionMatch = response.data.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
        const authorMatch = response.data.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
        
        if (videoMatch && videoMatch[1]) {
            const videoUrl = videoMatch[1];
            const videoPath = await downloadFromUrl(videoUrl, 'instagram');
            
            return { 
                path: videoPath, 
                caption: captionMatch ? captionMatch[1] : '',
                author: authorMatch ? authorMatch[1].replace(' on Instagram', '') : ''
            };
        }
        
        // Fallback: chercher dans le JSON-LD
        const jsonLdMatch = response.data.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        if (jsonLdMatch) {
            try {
                const jsonData = JSON.parse(jsonLdMatch[1]);
                const videoUrl = jsonData.video?.contentUrl || jsonData.contentUrl;
                
                if (videoUrl) {
                    const videoPath = await downloadFromUrl(videoUrl, 'instagram');
                    return { 
                        path: videoPath, 
                        caption: jsonData.description || '',
                        author: jsonData.author?.name || ''
                    };
                }
            } catch (e) {
                console.log('Erreur parsing JSON-LD:', e.message);
            }
        }
        
        throw new Error('Meta tags vidéo non trouvés');
    } catch (error) {
        throw new Error(`MetaTags: ${error.message}`);
    }
}

// ===== PINTEREST - Version améliorée avec multiple méthodes =====
async function downloadPinterest(url) {
    console.log('📌 Téléchargement Pinterest...');
    
    let videoPath = null;
    let caption = '';
    let author = '';
    
    // Liste des méthodes à essayer
    const methods = [
        { name: 'Pinterest API Direct', func: downloadPinterestDirect },
        { name: 'Pinterest Mobile API', func: downloadPinterestMobile },
        { name: 'Scraping Pinterest', func: downloadPinterestScraping }
    ];
    
    // Essayer chaque méthode
    for (const method of methods) {
        try {
            console.log(`🔄 Essai Pinterest: ${method.name}...`);
            const result = await method.func(url);
            
            if (result && result.path) {
                videoPath = result.path;
                caption = result.caption || '';
                author = result.author || '';
                console.log(`✅ Succès Pinterest avec ${method.name}!`);
                break;
            }
        } catch (error) {
            console.log(`❌ Pinterest ${method.name} échoué: ${error.message}`);
            continue;
        }
    }
    
    if (!videoPath) {
        throw new Error('Impossible de télécharger cette vidéo Pinterest. Vérifiez que:\n• Le lien est valide\n• C\'est bien une vidéo (Pin vidéo)\n• Le contenu est public');
    }
    
    return {
        path: videoPath,
        caption: caption,
        author: author
    };
}

// Méthode 1: Pinterest API Direct
async function downloadPinterestDirect(url) {
    try {
        // Nettoyer l'URL
        let cleanUrl = url;
        if (url.includes('pin.it')) {
            const response = await axios.get(url, {
                maxRedirects: 5,
                validateStatus: () => true,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            cleanUrl = response.request?.res?.responseUrl || url;
        }
        
        console.log('📌 URL Pinterest nettoyée:', cleanUrl);
        
        // Obtenir l'ID du pin
        const pinIdMatch = cleanUrl.match(/pin\/(\d+)/);
        if (!pinIdMatch) {
            throw new Error('ID Pin non trouvé');
        }
        
        const pinId = pinIdMatch[1];
        
        // API Pinterest pour récupérer les données
        const apiUrl = `https://www.pinterest.com/resource/BasePinResource/get/?source_url=%2Fpin%2F${pinId}%2F&data=%7B%22options%22%3A%7B%22id%22%3A%22${pinId}%22%2C%22field_set_key%22%3A%22react_grid_pin%22%7D%7D`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': cleanUrl
            },
            timeout: 15000
        });
        
        if (response.data && response.data.resource_response && response.data.resource_response.data) {
            const pinData = response.data.resource_response.data;
            
            // Chercher la vidéo
            const videos = pinData.videos?.video_list;
            if (videos) {
                // Prendre la meilleure qualité
                const qualityOrder = ['V_720P', 'V_HLSV3_MOBILE', 'V_HLSV4', 'V_HLSV3', 'V_HLSV2'];
                
                let videoUrl = null;
                for (const quality of qualityOrder) {
                    if (videos[quality] && videos[quality].url) {
                        videoUrl = videos[quality].url;
                        break;
                    }
                }
                
                if (videoUrl) {
                    const videoPath = await downloadFromUrl(videoUrl, 'pinterest');
                    
                    return {
                        path: videoPath,
                        caption: pinData.description || pinData.title || '',
                        author: pinData.pinner?.username || pinData.pinner?.full_name || ''
                    };
                }
            }
        }
        
        throw new Error('Aucune vidéo trouvée dans l\'API');
        
    } catch (error) {
        throw new Error(`Pinterest Direct: ${error.message}`);
    }
}

// Méthode 2: Pinterest Mobile API
async function downloadPinterestMobile(url) {
    try {
        // Utiliser l'API mobile
        const mobileUrl = url.replace('www.pinterest.', 'api.pinterest.');
        
        const response = await axios.get(mobileUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 15000
        });
        
        const html = response.data;
        
        // Chercher les données JSON
        const jsonMatch = html.match(/<script id="__PWS_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        
        if (jsonMatch) {
            const jsonData = JSON.parse(jsonMatch[1]);
            const pinData = jsonData.props?.initialReduxState?.pins?.[Object.keys(jsonData.props.initialReduxState.pins)[0]];
            
            if (pinData && pinData.videos) {
                const videoList = pinData.videos.video_list;
                
                // Chercher la meilleure qualité
                const bestQuality = Object.keys(videoList)
                    .filter(key => key.startsWith('V_'))
                    .sort((a, b) => {
                        // Trier par qualité décroissante
                        const qualityA = parseInt(a.match(/\d+/)?.[0]) || 0;
                        const qualityB = parseInt(b.match(/\d+/)?.[0]) || 0;
                        return qualityB - qualityA;
                    })[0];
                
                if (bestQuality && videoList[bestQuality]?.url) {
                    const videoUrl = videoList[bestQuality].url;
                    const videoPath = await downloadFromUrl(videoUrl, 'pinterest');
                    
                    return {
                        path: videoPath,
                        caption: pinData.description || pinData.title || '',
                        author: pinData.pinner?.username || pinData.pinner?.full_name || ''
                    };
                }
            }
        }
        
        throw new Error('Données vidéo non trouvées');
        
    } catch (error) {
        throw new Error(`Pinterest Mobile: ${error.message}`);
    }
}

// Méthode 3: Scraping traditionnel (fallback)
async function downloadPinterestScraping(url) {
    try {
        console.log('📌 Scraping Pinterest traditionnel...');
        
        // Nettoyer l'URL
        let cleanUrl = url;
        if (url.includes('pin.it')) {
            const response = await axios.get(url, {
                maxRedirects: 5,
                validateStatus: () => true,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            cleanUrl = response.request?.res?.responseUrl || url;
        }
        
        console.log('📌 URL Pinterest finale:', cleanUrl);
        
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
        const caption = descMatch ? descMatch[1].replace(/\\n/g, '\n').replace(/\\u[\dA-F]{4}/gi, '') : '';
        
        // Extraire l'auteur
        const authorMatch = response.data.match(/"username":"([^"]+)"/);
        const author = authorMatch ? authorMatch[1] : '';
        
        // Chercher les URLs vidéo dans différents formats
        const patterns = [
            /"contentUrl":"([^"]+)"/,
            /"video_list":\s*\{[^}]*"V_720P":\s*\{[^}]*"url":"([^"]+)"/,
            /"video_list":\s*\{[^}]*"V_HLSV4":\s*\{[^}]*"url":"([^"]+)"/,
            /"videos":\s*\{[^}]*"video_list":\s*\{[^}]*"V_\w+":\s*\{[^}]*"url":"([^"]+)"/,
            /"url":"(https:\/\/[^"]*\.mp4[^"]*)"/,
            /<video[^>]*src="([^"]+)"/i,
            /source src="([^"]+\.mp4[^"]*)"/i
        ];
        
        for (const pattern of patterns) {
            const match = response.data.match(pattern);
            if (match && match[1]) {
                let videoUrl = match[1].replace(/\\/g, '');
                
                // Si c'est une URL relative
                if (videoUrl.startsWith('//')) {
                    videoUrl = 'https:' + videoUrl;
                } else if (videoUrl.startsWith('/')) {
                    videoUrl = 'https://www.pinterest.com' + videoUrl;
                }
                
                console.log('✅ URL Pinterest trouvée via scraping:', videoUrl);
                const videoPath = await downloadFromUrl(videoUrl, 'pinterest');
                
                return { 
                    path: videoPath, 
                    caption: caption,
                    author: author 
                };
            }
        }
        
        throw new Error('URL vidéo Pinterest non trouvée dans le HTML');
        
    } catch (error) {
        console.error('❌ Erreur Pinterest scraping:', error.message);
        throw new Error(`Pinterest Scraping: ${error.message}`);
    }
}

// ===== TÉLÉCHARGER DEPUIS URL (avec meilleure qualité) =====
async function downloadFromUrl(videoUrl, platform) {
    try {
        const filename = `${platform}_${Date.now()}.mp4`;
        const filepath = path.join(DOWNLOAD_DIR, filename);
        
        console.log(`⬇️ Téléchargement vidéo depuis ${platform}...`);
        console.log(`📥 URL: ${videoUrl.substring(0, 100)}...`);
        
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': `https://www.${platform}.com/`,
                'Accept': '*/*',
                'Accept-Encoding': 'identity', // Important: désactive la compression pour les vidéos
                'Connection': 'keep-alive',
                'Range': 'bytes=0-' // Pour permettre la reprise si nécessaire
            },
            timeout: 180000, // 3 minutes pour les vidéos HD
            maxRedirects: 10,
            maxContentLength: 200 * 1024 * 1024, // Max 200MB
            validateStatus: (status) => status >= 200 && status < 400
        });
        
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            let downloadedSize = 0;
            let lastLog = Date.now();
            
            response.data.on('data', (chunk) => {
                downloadedSize += chunk.length;
                
                // Log toutes les 2 secondes
                const now = Date.now();
                if (now - lastLog > 2000) {
                    const mbDownloaded = (downloadedSize / (1024 * 1024)).toFixed(2);
                    console.log(`📊 ${mbDownloaded} MB téléchargés...`);
                    lastLog = now;
                }
            });
            
            writer.on('finish', () => {
                const stats = fs.statSync(filepath);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                
                // Vérifier que le fichier n'est pas trop petit (erreur)
                if (stats.size < 50000) { // Moins de 50KB
                    fs.unlinkSync(filepath);
                    reject(new Error(`Fichier trop petit (${stats.size} bytes) - probablement une erreur`));
                    return;
                }
                
                console.log(`✅ Vidéo téléchargée: ${filename} (${fileSizeMB} MB)`);
                resolve(filepath);
            });
            
            writer.on('error', (error) => {
                console.error('❌ Erreur lors de l\'écriture du fichier:', error);
                
                // Nettoyer le fichier en cas d'erreur
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
                
                reject(new Error('Erreur lors du téléchargement de la vidéo: ' + error.message));
            });
            
            // Timeout de sécurité
            const timeout = setTimeout(() => {
                writer.close();
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
                reject(new Error('Timeout: le téléchargement a pris trop de temps (3 minutes)'));
            }, 180000);
            
            writer.on('finish', () => clearTimeout(timeout));
            writer.on('error', () => clearTimeout(timeout));
        });
        
    } catch (error) {
        console.error('❌ Erreur downloadFromUrl:', error.message);
        
        // Donner plus d'informations sur l'erreur
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
        }
        
        throw new Error(`Échec du téléchargement de la vidéo: ${error.message}`);
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
    detectPlatform,
    cleanOldFiles
};

console.log('✅ Module downloader chargé avec succès!');
console.log('📁 Dossier de téléchargement:', DOWNLOAD_DIR);