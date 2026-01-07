// ===== INSTALLATION DES DÉPENDANCES =====
// Exécutez ces commandes dans votre terminal:
// npm install express cors node-telegram-bot-api dotenv winston express-rate-limit validator
// ========================================

// ===== IMPORTS =====
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
const { downloadVideo } = require('./downloader');
const { getUser, updateUserFreeTime, checkFreeTime } = require('./database');

// ===== CONFIGURATION WINSTON LOGGER =====
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// ===== CONFIGURATION =====
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://tik-dl3.vercel.app';
const DOWNLOAD_DIR = path.join(__dirname, '../downloads');

// ===== VALIDATION ENVIRONNEMENT =====
const requiredEnv = ['TELEGRAM_BOT_TOKEN'];
for (const env of requiredEnv) {
    if (!process.env[env]) {
        logger.error(`❌ Variable manquante: ${env}`);
        process.exit(1);
    }
}

// ===== CONSTANTES CENTRALISÉES =====
const PLATFORMS = {
    tiktok: { 
        regex: /(tiktok\.com|vm\.tiktok\.com|www\.tiktok\.com)/i, 
        name: 'TikTok', 
        icon: '🎵' 
    },
    instagram: { 
        regex: /(instagram\.com|instagr\.am|ig\.me|www\.instagram\.com)/i, 
        name: 'Instagram', 
        icon: '📸' 
    },
    pinterest: { 
        regex: /(pinterest\.com|pinterest\.fr|pinterest\.ca|pin\.it|www\.pinterest\.com)/i, 
        name: 'Pinterest', 
        icon: '📌' 
    }
};

const ERROR_MESSAGES = {
    URL_INVALID: '❌ Lien invalide. Vérifiez que l\'URL commence par http:// ou https://',
    PRIVATE_VIDEO: '🔒 Vidéo privée ou compte protégé',
    RATELIMIT: '⏳ Trop de demandes, réessayez dans 1 minute',
    DOWNLOAD_FAILED: '❌ Échec du téléchargement',
    AD_REQUIRED: '⚠️ Tu dois d\'abord regarder une pub !',
    FILE_TOO_LARGE: '📦 Vidéo trop lourde (max 200MB)',
    TIMEOUT: '⏱️ Téléchargement trop long (timeout 3 min)'
};

// ===== MIDDLEWARE =====
app.use(cors({
    origin: [WEBAPP_URL, 'https://t.me', 'https://web.telegram.org'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== RATE LIMITING =====
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 requêtes par fenêtre
    message: ERROR_MESSAGES.RATELIMIT,
    standardHeaders: true,
    legacyHeaders: false
});

const downloadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 heure
    max: 50, // 50 téléchargements par heure
    message: ERROR_MESSAGES.RATELIMIT
});

// ===== BOT TELEGRAM =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
logger.info('🤖 Bot Telegram démarré...');

// Commande /start avec bouton WebApp
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'utilisateur';
    
    const keyboard = {
        inline_keyboard: [
            [
                {
                    text: '🚀 Ouvrir Video Downloader',
                    web_app: { url: WEBAPP_URL }
                }
            ],
            [
                {
                    text: '❓ Aide',
                    callback_data: 'help'
                }
            ]
        ]
    };
    
    bot.sendMessage(
        chatId,
        `👋 Salut ${firstName} !\n\n` +
        `Bienvenue sur **Video Downloader** 🎥\n\n` +
        `Je peux télécharger des vidéos depuis :\n` +
        `🎵 TikTok  🎨 Pinterest\n\n` +
        `**Comment ça marche ?**\n` +
        `1️⃣ Clique sur le bouton ci-dessous\n` +
        `2️⃣ Regarde une pub (2h gratuit)\n` +
        `3️⃣ Colle le lien de ta vidéo\n` +
        `4️⃣ Je t'envoie la vidéo ici ! 🎉\n\n` +
        `C'est parti ! 👇`,
        {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }
    );
});

// Commande /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    sendHelpMessage(chatId);
});

// Callback pour le bouton Aide
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    
    if (query.data === 'help') {
        sendHelpMessage(chatId);
        bot.answerCallbackQuery(query.id, { text: 'Voici l\'aide !' });
    }
});

// Fonction d'aide
function sendHelpMessage(chatId) {
    bot.sendMessage(
        chatId,
        `📖 **Aide Video Downloader**\n\n` +
        `**🎯 Comment utiliser le bot ?**\n` +
        `1. Clique sur "🚀 Ouvrir Video Downloader"\n` +
        `2. Regarde une pub pour débloquer 2h\n` +
        `3. Colle le lien de ta vidéo\n` +
        `4. Clique sur Télécharger\n` +
        `5. Je t'envoie la vidéo ici ! 📹\n\n` +
        `**✅ Plateformes supportées :**\n` +
        `• TikTok (sans watermark)\n` +
        `• Pinterest\n\n` +
        `**⏰ Système gratuit :**\n` +
        `• 1 pub = 2h de téléchargements\n` +
        `• Illimité pendant 2h\n` +
        `• Après 2h, regarde une nouvelle pub\n\n` +
        `**🆘 Problèmes ?**\n` +
        `• Vérifie que le lien est public\n` +
        `• Vérifie que c'est bien une vidéo\n` +
        `• Contacte @support si besoin\n\n` +
        `Bonne utilisation ! 😊`,
        { parse_mode: 'Markdown' }
    );
}

// Répondre aux messages texte (liens envoyés directement)
bot.on('message', async (msg) => {
    // Ignorer les commandes
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }
    
    // Vérifier si c'est un lien
    const text = msg.text || '';
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlPattern);
    
    if (urls && urls.length > 0) {
        const chatId = msg.chat.id;
        const url = urls[0];
        
        // Détecter la plateforme
        const platformEntry = Object.entries(PLATFORMS).find(([_, p]) => p.regex.test(url));
        
        if (platformEntry) {
            const platform = platformEntry[0];
            
            // Vérifier free time
            const hasFreeTime = await checkFreeTime(chatId);
            
            if (!hasFreeTime) {
                const keyboard = {
                    inline_keyboard: [[{
                        text: '🚀 Ouvrir l\'app',
                        web_app: { url: WEBAPP_URL }
                    }]]
                };
                
                bot.sendMessage(
                    chatId,
                    ERROR_MESSAGES.AD_REQUIRED + `\n\n` +
                    `Ouvre l'application et regarde une pub pour débloquer 2h de téléchargements gratuits 🎁`,
                    { reply_markup: keyboard }
                );
                return;
            }
            
            // Télécharger
            bot.sendMessage(chatId, `⏳ Téléchargement en cours...\nPlateforme : ${PLATFORMS[platform].name}`);
            
            try {
                await downloadAndSend(chatId, url, platform);
            } catch (error) {
                const userMessage = formatErrorMessage(error);
                bot.sendMessage(chatId, userMessage);
            }
        } else {
            bot.sendMessage(
                chatId,
                `❌ Plateforme non supportée.\n\n` +
                `J'accepte uniquement :\n` +
                `🎵 TikTok\n` +
                `📸 Instagram\n` +
                `📌 Pinterest`
            );
        }
    }
});

// ===== API ROUTES =====

// GET /api/status/:userId - Vérifier le statut free time
app.get('/api/status/:userId', apiLimiter, async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId || isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'User ID invalide'
            });
        }
        
        const user = await getUser(userId);
        
        if (!user || !user.freeUntil) {
            return res.json({
                hasFreeTime: false,
                remainingMinutes: 0
            });
        }
        
        const now = new Date();
        const expiresAt = new Date(user.freeUntil);
        
        if (expiresAt > now) {
            const remainingMs = expiresAt - now;
            const remainingMinutes = Math.floor(remainingMs / 60000);
            
            return res.json({
                hasFreeTime: true,
                expiresAt: user.freeUntil,
                remainingMinutes: remainingMinutes
            });
        } else {
            return res.json({
                hasFreeTime: false,
                remainingMinutes: 0
            });
        }
        
    } catch (error) {
        logger.error('Erreur status:', { error: error.message, stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// POST /api/watch-ad - Enregistrer qu'une pub a été vue
app.post('/api/watch-ad', apiLimiter, async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId || isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'User ID manquant ou invalide'
            });
        }
        
        // Donner 2h de free time
        const freeUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);
        
        await updateUserFreeTime(userId, freeUntil);
        
        logger.info(`✅ Pub regardée`, { userId, freeUntil });
        
        // Envoyer un message de confirmation
        bot.sendMessage(
            userId,
            `🎉 Parfait !\n\n` +
            `Tu as maintenant **2 heures** de téléchargements gratuits !\n\n` +
            `Tu peux télécharger autant de vidéos que tu veux pendant les 2 prochaines heures. ⏰`
        ).catch(err => logger.error('Erreur envoi message:', err));
        
        res.json({
            success: true,
            freeUntil: freeUntil.toISOString(),
            message: '2h de téléchargements activés'
        });
        
    } catch (error) {
        logger.error('Erreur watch-ad:', { error: error.message, stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// POST /api/download - Télécharger une vidéo
app.post('/api/download', downloadLimiter, async (req, res) => {
    try {
        const { userId, url, platform } = req.body;
        
        // Validation stricte
        if (!userId || isNaN(userId)) {
            return res.status(400).json({ success: false, message: 'User ID invalide' });
        }
        
        if (!url || !validator.isURL(url, { require_protocol: true })) {
            return res.status(400).json({ success: false, message: ERROR_MESSAGES.URL_INVALID });
        }
        
        if (!platform || !PLATFORMS[platform]) {
            return res.status(400).json({ success: false, message: 'Platforme invalide' });
        }
        
        // Vérifier free time
        const hasFreeTime = await checkFreeTime(userId);
        
        if (!hasFreeTime) {
            return res.status(403).json({
                success: false,
                needsAd: true,
                message: ERROR_MESSAGES.AD_REQUIRED
            });
        }
        
        logger.info(`📥 Téléchargement demandé`, { userId, platform, url: url.substring(0, 50) });
        
        // Répondre immédiatement
        res.json({
            success: true,
            message: 'Téléchargement en file d\'attente...'
        });
        
        // Télécharger et envoyer (asynchrone, non bloquant)
        downloadAndSend(userId, url, platform);
        
    } catch (error) {
        logger.error('Erreur download:', { error: error.message, stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ===== FONCTION TÉLÉCHARGEMENT + ENVOI =====
async function downloadAndSend(userId, url, platform) {
    let videoPath = null;
    let statusMsg = null;
    
    try {
        // Validation URL
        if (!validator.isURL(url, { require_protocol: true })) {
            throw new Error('URL invalide');
        }
        
        logger.info(`⬇️ Début téléchargement`, { userId, platform, url: url.substring(0, 50) });
        
        // Envoyer message de statut
        statusMsg = await bot.sendMessage(
            userId,
            `⏳ Téléchargement en cours...\n\n` +
            `Plateforme : ${PLATFORMS[platform].name.toUpperCase()}\n` +
            `Cela peut prendre 10-30 secondes ⏱️`
        );
        
        // Télécharger la vidéo
        const result = await downloadVideo(url, platform);
        
        if (!result || !result.path) {
            throw new Error('Échec du téléchargement: fichier non créé');
        }
        
        videoPath = result.path;
        
        // Supprimer message de statut
        await bot.deleteMessage(userId, statusMsg.message_id).catch(() => {});
        
        // Construire caption
        const fullCaption = buildCaption(result, platform);
        
        // Envoyer la vidéo
        await bot.sendVideo(userId, videoPath, {
            caption: fullCaption,
            supports_streaming: true,
            parse_mode: 'Markdown'
        });
        
        logger.info(`✅ Vidéo envoyée`, { userId, platform, file: videoPath });
        
    } catch (error) {
        logger.error(`❌ Erreur téléchargement`, { 
            userId, 
            platform, 
            error: error.message, 
            stack: error.stack 
        });
        
        // Supprimer le message de statut en cas d'erreur
        if (statusMsg) {
            await bot.deleteMessage(userId, statusMsg.message_id).catch(() => {});
        }
        
        // Envoyer l'erreur exacte à l'utilisateur (en dev) ou un message générique (en prod)
        const userMessage = formatErrorMessage(error);
        await bot.sendMessage(userId, userMessage);
        
    } finally {
        // ⭐ CRITIQUE: Toujours supprimer le fichier temporaire
        if (videoPath && fs.existsSync(videoPath)) {
            try {
                fs.unlinkSync(videoPath);
                logger.info(`🗑️ Fichier supprimé`, { file: videoPath });
            } catch (unlinkError) {
                logger.error(`❌ Erreur suppression fichier`, { 
                    file: videoPath, 
                    error: unlinkError.message 
                });
            }
        }
    }
}

// ===== HELPERS =====

function buildCaption(result, platform) {
    let caption = `✅ Vidéo ${PLATFORMS[platform].name.toUpperCase()}\n\n`;
    
    if (result.caption) {
        const truncated = result.caption.length > 800 
            ? result.caption.substring(0, 797) + '...' 
            : result.caption;
        caption += `📝 ${truncated}\n\n`;
    }
    
    if (platform === 'tiktok' && result.author) {
        caption += `👤 @${result.author}\n`;
    }
    
    if (platform === 'tiktok' && result.music) {
        caption += `🎵 ${result.music}\n`;
    }
    
    caption += `\n🎥 Téléchargé avec Video Downloader`;
    return caption;
}

function formatErrorMessage(error) {
    // En développement: envoyer l'erreur exacte
    if (process.env.NODE_ENV === 'development') {
        return `❌ Erreur détaillée:\n\n${error.message}\n\nStack trace:\n${error.stack}`;
    }
    
    // En production: message générique mais informatif
    if (error.message.includes('URL invalide')) {
        return ERROR_MESSAGES.URL_INVALID;
    } else if (error.message.includes('private') || error.message.includes('privée')) {
        return ERROR_MESSAGES.PRIVATE_VIDEO;
    } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
        return ERROR_MESSAGES.TIMEOUT;
    } else if (error.message.includes('Too large') || error.message.includes('100MB')) {
        return ERROR_MESSAGES.FILE_TOO_LARGE;
    } else if (error.message.includes('ratelimit') || error.message.includes('trop de demandes')) {
        return ERROR_MESSAGES.RATELIMIT;
    } else {
        return `❌ Erreur lors du téléchargement.\n\n` +
               `Raisons possibles:\n` +
               `• Vidéo privée ou supprimée\n` +
               `• Lien invalide\n` +
               `• Problème technique\n` +
               `• Vidéo trop lourde (>200MB)\n\n` +
               `Réessayez ou contactez le support.`;
    }
}

// ===== HEALTH CHECK =====
app.get('/health', async (req, res) => {
    try {
        // Vérifier la base de données
        const dbStatus = await getUser(123456789).then(() => 'OK').catch(() => 'ERROR');
        
        // Vérifier le bot
        const botStatus = await bot.getMe().then(() => 'OK').catch(() => 'ERROR');
        
        // Vérifier l'espace disque
        const fs = require('fs').promises;
        const stats = await fs.stat(DOWNLOAD_DIR).catch(() => null);
        const diskStatus = stats ? 'OK' : 'ERROR';
        
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            services: {
                bot: botStatus,
                database: dbStatus,
                disk: diskStatus
            },
            uptime: process.uptime()
        });
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({ status: 'ERROR', error: error.message });
    }
});

// ===== ROOT =====
app.get('/', (req, res) => {
    res.json({
        name: 'Video Downloader API',
        version: '2.0.0',
        mode: process.env.NODE_ENV || 'production',
        endpoints: {
            status: 'GET /api/status/:userId',
            watchAd: 'POST /api/watch-ad',
            download: 'POST /api/download',
            health: 'GET /health'
        },
        bot: {
            status: 'running',
            webapp: WEBAPP_URL
        }
    });
});

// ===== ERROR HANDLER GLOBAL =====
app.use((error, req, res, next) => {
    logger.error('❌ Erreur non gérée:', { 
        error: error.message, 
        stack: error.stack,
        url: req.url,
        method: req.method
    });
    
    res.status(500).json({
        success: false,
        message: 'Erreur serveur interne',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// ===== DÉMARRAGE SERVEUR =====
app.listen(PORT, () => {
    logger.info(`🚀 Serveur démarré`, {
        port: PORT,
        webapp: WEBAPP_URL,
        botToken: BOT_TOKEN ? '✅ Configuré' : '❌ Manquant',
        nodeEnv: process.env.NODE_ENV || 'production'
    });
});

// ===== GESTION ERREURS BOT =====
bot.on('polling_error', (error) => {
    logger.error('Erreur polling bot:', { 
        code: error.code, 
        message: error.message 
    });
});

bot.on('error', (error) => {
    logger.error('Erreur bot:', error);
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGINT', () => {
    logger.info('\n👋 Arrêt du serveur...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('\n👋 Arrêt forcé (SIGTERM)...');
    bot.stopPolling();
    process.exit(0);
});
