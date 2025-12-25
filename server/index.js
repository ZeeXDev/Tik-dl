// ===== IMPORTS =====
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { downloadVideo } = require('./downloader');
const { getUser, updateUserFreeTime, checkFreeTime } = require('./database');

// ===== CONFIGURATION =====
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://tik-dl3.vercel.app';

// ===== MIDDLEWARE =====
app.use(cors({
    origin: [WEBAPP_URL, 'https://t.me', 'https://web.telegram.org'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== BOT TELEGRAM =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Bot Telegram démarré...');

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
        `🎵 TikTok\n` +
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
        `**⏰ Système gratuit :**\n` +
        `• 1 pub = 2h de téléchargements\n` +
        `• Illimité pendant 2h\n` +
        `• Après 2h, regarde une nouvelle pub\n\n` +
        `**🆘 Problèmes ?**\n` +
        `• Vérifie que le lien est public\n` +
        `• Vérifie que c'est bien une vidéo\n` +
        `• Contacte le support si besoin\n\n` +
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
        let platform = null;
        if (url.match(/(tiktok\.com|vm\.tiktok\.com)/i)) platform = 'tiktok';
        else if (url.match(/(instagram\.com|instagr\.am|ig\.me)/i)) platform = 'instagram';
        else if (url.match(/(pinterest\.com|pinterest\.fr|pinterest\.ca|pin\.it)/i)) platform = 'pinterest';
        
        if (platform) {
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
                    `⚠️ Tu dois d'abord regarder une pub !\n\n` +
                    `Ouvre l'application et regarde une pub pour débloquer 2h de téléchargements gratuits 🎁`,
                    { reply_markup: keyboard }
                );
                return;
            }
            
            // Télécharger
            bot.sendMessage(chatId, `⏳ Téléchargement en cours...\nPlateforme : ${platform.toUpperCase()}`);
            
            try {
                await downloadAndSend(chatId, url, platform);
            } catch (error) {
                bot.sendMessage(
                    chatId,
                    `❌ Erreur lors du téléchargement.\n\n` +
                    `Raisons possibles :\n` +
                    `• Vidéo privée ou supprimée\n` +
                    `• Lien invalide\n` +
                    `• Problème technique\n\n` +
                    `Réessaie avec un autre lien.`
                );
            }
        } else {
            bot.sendMessage(
                chatId,
                `❌ Plateforme non supportée.\n\n` +
                `J'accepte uniquement :\n` +
                `🎵 TikTok`
            );
        }
    }
});

// ===== API ROUTES =====

// GET /api/status/:userId - Vérifier le statut free time
app.get('/api/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
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
        console.error('Erreur status:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// POST /api/watch-ad - Enregistrer qu'une pub a été vue
app.post('/api/watch-ad', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID manquant'
            });
        }
        
        // Donner 2h de free time
        const freeUntil = new Date(Date.now() + 2 * 60 * 60 * 1000); // +2h
        
        await updateUserFreeTime(userId, freeUntil);
        
        console.log(`✅ User ${userId} a regardé une pub - Free until: ${freeUntil}`);
        
        // Envoyer un message de confirmation
        bot.sendMessage(
            userId,
            `🎉 Parfait !\n\n` +
            `Tu as maintenant **2 heures** de téléchargements gratuits !\n\n` +
            `Tu peux télécharger autant de vidéos que tu veux pendant les 2 prochaines heures. ⏰\n\n` +
            `Bon téléchargement ! 📥`
        ).catch(err => console.log('Erreur envoi message:', err));
        
        res.json({
            success: true,
            freeUntil: freeUntil.toISOString(),
            message: '2h de téléchargements activés'
        });
        
    } catch (error) {
        console.error('Erreur watch-ad:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// POST /api/download - Télécharger une vidéo
app.post('/api/download', async (req, res) => {
    try {
        const { userId, url, platform } = req.body;
        
        // Validation
        if (!userId || !url || !platform) {
            return res.status(400).json({
                success: false,
                message: 'Données manquantes'
            });
        }
        
        // Vérifier free time
        const hasFreeTime = await checkFreeTime(userId);
        
        if (!hasFreeTime) {
            return res.status(403).json({
                success: false,
                needsAd: true,
                message: 'Regardez une pub pour continuer'
            });
        }
        
        console.log(`📥 Téléchargement demandé - User: ${userId}, Platform: ${platform}`);
        
        // Répondre immédiatement
        res.json({
            success: true,
            message: 'Téléchargement en cours...'
        });
        
        // Télécharger et envoyer (asynchrone)
        downloadAndSend(userId, url, platform);
        
    } catch (error) {
        console.error('Erreur download:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// ===== FONCTION TÉLÉCHARGEMENT + ENVOI =====
async function downloadAndSend(userId, url, platform) {
    try {
        console.log(`⬇️ Téléchargement ${platform} pour user ${userId}...`);
        
        // Envoyer un message de statut
        const statusMsg = await bot.sendMessage(
            userId,
            `⏳ Téléchargement en cours...\n\n` +
            `Plateforme : ${platform.toUpperCase()}\n` +
            `Cela peut prendre 10-30 secondes ⏱️`
        );
        
        // Télécharger la vidéo
        const result = await downloadVideo(url, platform);
        
        if (!result || !result.path) {
            throw new Error('Échec du téléchargement');
        }
        
        const videoPath = result.path;
        const caption = result.caption || '';
        const author = result.author || '';
        const music = result.music || '';
        
        console.log(`✅ Vidéo téléchargée: ${videoPath}`);
        if (caption) console.log(`📝 Caption: ${caption}`);
        
        // Supprimer le message de statut
        bot.deleteMessage(userId, statusMsg.message_id).catch(() => {});
        
        // Construire la légende complète
        let fullCaption = `✅ Vidéo ${platform.toUpperCase()}\n\n`;
        
        // Ajouter la légende originale si elle existe
        if (caption) {
            // Limiter la caption à 800 caractères (Telegram limite = 1024)
            const truncatedCaption = caption.length > 800 ? caption.substring(0, 797) + '...' : caption;
            fullCaption += `📝 ${truncatedCaption}\n\n`;
        }
        
        // Ajouter l'auteur pour TikTok
        if (platform === 'tiktok' && author) {
            fullCaption += `👤 @${author}\n`;
        }
        
        // Ajouter la musique pour TikTok
        if (platform === 'tiktok' && music) {
            fullCaption += `🎵 ${music}\n`;
        }
        
        fullCaption += `\n🎥 Téléchargé avec Video Downloader`;
        
        // Envoyer via bot
        await bot.sendVideo(userId, videoPath, {
            caption: fullCaption,
            supports_streaming: true,
            parse_mode: 'Markdown'
        });
        
        console.log(`📤 Vidéo envoyée à ${userId}`);
        
        // Supprimer le fichier temporaire
        const fs = require('fs');
        if (fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
            console.log(`🗑️ Fichier temporaire supprimé`);
        }
        
    } catch (error) {
        console.error('Erreur downloadAndSend:', error);
        
        // Envoyer message d'erreur à l'utilisateur
        bot.sendMessage(
            userId,
            `❌ Désolé, une erreur est survenue lors du téléchargement.\n\n` +
            `Raisons possibles :\n` +
            `• Vidéo privée ou supprimée\n` +
            `• Lien invalide\n` +
            `• Problème de connexion\n` +
            `• Vidéo trop lourde\n\n` +
            `Réessayez avec un autre lien ou contactez le support.`
        );
    }
}

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        bot: 'running',
        webapp: WEBAPP_URL
    });
});

// ===== ROOT =====
app.get('/', (req, res) => {
    res.json({
        name: 'Video Downloader API',
        version: '1.0.0',
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

// ===== ERROR HANDLER =====
app.use((error, req, res, next) => {
    console.error('Erreur:', error);
    res.status(500).json({
        success: false,
        message: 'Erreur serveur interne'
    });
});

// ===== DÉMARRAGE SERVEUR =====
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📱 WebApp URL: ${WEBAPP_URL}`);
    console.log(`🤖 Bot Token: ${BOT_TOKEN ? '✅ Configuré' : '❌ Manquant'}`);
    console.log(`🌐 Backend URL: http://localhost:${PORT}`);
});

// ===== GESTION ERREURS BOT =====
bot.on('polling_error', (error) => {
    console.error('Erreur polling:', error.code, error.message);
});

bot.on('error', (error) => {
    console.error('Erreur bot:', error);
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGINT', () => {
    console.log('\n👋 Arrêt du serveur...');
    bot.stopPolling();
    process.exit(0);
});