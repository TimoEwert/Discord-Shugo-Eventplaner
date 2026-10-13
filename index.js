// ==========================================
// Projekt: Shugo-Eventplaner (Version 7.3)
// Beschreibung: DM-Wizard, Eigener Titel, Auto-Delete, Live-Dashboard mit Klassen-Emojis (z.B. 🔥 2x, 🛡️ 1x = 3/5)
// und Echtzeit-Aktualisierung bei An/Abmeldungen.
// ==========================================

const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ]
});

const activeEvents = new Map();     // messageId -> EventData
const activeDashboards = new Map(); // channelId -> dashboardMessageId
const wizardSessions = new Map();   // userId -> Wizard State

const PREDEFINED_EVENT_TITLES = [
    { label: 'Dredgion', value: 'Dredgion Run', description: 'PvPvE Instanz', emoji: '⚔️' },
    { label: 'Tiamat Festung', value: 'Tiamat Festung Raid', description: 'Großer Allianz-Raid', emoji: '🔥' },
    { label: 'Dark Poeta', value: 'Dark Poeta (S-Rank)', description: 'PvE Instanz Farmen', emoji: '👻' },
    { label: 'Event 1', value: 'Event 1 (Custom)', description: 'Benutzerdefiniertes Event 1', emoji: '📌' },
    { label: 'Event 2', value: 'Event 2 (Custom)', description: 'Benutzerdefiniertes Event 2', emoji: '📌' },
    { label: 'Eigener Titel', value: 'CUSTOM_TITLE', description: 'Gib einen eigenen Event-Namen ein', emoji: '✏️' }
];

const commands = [
    new SlashCommandBuilder()
        .setName('event-create')
        .setDescription('Startet die schrittweise Event-Erstellung per Direktnachricht.'),
    new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('Postet oder aktualisiert das Live-Event-Dashboard in diesem Kanal.')
];

// Live-Dashboard Aktualisierungsfunktion (Block 1 aktualisiert)
async function updateAllDashboards() {
    for (const [channelId, dashMsgId] of activeDashboards.entries()) {
        try {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) continue;
            const dashMsg = await channel.messages.fetch(dashMsgId).catch(() => null);
            if (!dashMsg) continue;

            const dashboardEmbed = new EmbedBuilder()
                .setTitle('📋 Shugo-Eventplaner Dashboard (Live)')
                .setDescription('Übersicht aller aktuell aktiven Events auf dem Server.')
                .setColor(0xFFD700)
                .setTimestamp();

            if (activeEvents.size === 0) {
                dashboardEmbed.addFields({ name: 'Aktive Events', value: '*Derzeit sind keine Events geplant.*' });
            } else {
                let eventListText = '';
                for (const [msgId, ev] of activeEvents.entries()) {
                    const signupCount = ev.signups.size;
                    
                    const classCounts = {};
                    for (const data of ev.signups.values()) {
                        classCounts[data.emoji] = (classCounts[data.emoji] || 0) + 1;
                    }

                    const emojiList = Object.entries(classCounts)
                        .map(([emoji, count]) => `${emoji} ${count}x`)
                        .join(' ');

                    const signupStatus = emojiList.length > 0 
                        ? `${emojiList} (${signupCount}/5)` 
                        : `(${signupCount}/5)`;

                    eventListText += `• **${ev.title}** ${signupStatus} um *${ev.time}* (Erstellt von ${ev.creator}) - [Zum Event](https://discord.com/channels/${ev.guildId}/${ev.channelId}/${msgId})\n`;
                }
                dashboardEmbed.addFields({ name: 'Geplante Events', value: eventListText });
            }

            const refreshBtn = new ButtonBuilder()
                .setCustomId('dashboard_refresh_btn')
                .setLabel('🔄 Dashboard aktualisieren')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(refreshBtn);

            await dashMsg.edit({ embeds: [dashboardEmbed], components: [row] });
        } catch (err) {
            console.error('Fehler beim Aktualisieren des Dashboards:', err);
        }
    }
}

// Hintergrund-Check für Auto-Delete
setInterval(async () => {
    const now = Date.now();
    let changed = false;

    for (const [messageId, eventData] of activeEvents.entries()) {
        if (eventData.expireTimestamp && now >= eventData.expireTimestamp) {
            try {
                const channel = await client.channels.fetch(eventData.channelId).catch(() => null);
                if (channel) {
                    const msg = await channel.messages.fetch(messageId).catch(() => null);
                    if (msg) await msg.delete().catch(() => null);
                }
            } catch (err) {}
            activeEvents.delete(messageId);
            changed = true;
        }
    }

    if (changed) {
        await updateAllDashboards();
    }
}, 30000);

client.once('ready', async () => {
    console.log('[Shugo-Eventplaner v7.3] Bot ist eingeloggt!');
    try {
        await client.application.commands.set(commands);
        console.log('Slash Commands erfolgreich registriert.');
    } catch (error) {
        console.error('Fehler beim Registrieren der Slash Commands:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'event-create') {
            const targetChannel = interaction.channel;

            try {
                const dmChannel = await interaction.user.createDM();
                
                await interaction.reply({ 
                    content: 'Ich habe dir eine Direktnachricht geschickt, um das Event zu starten!', 
                    ephemeral: true 
                });

                wizardSessions.set(interaction.user.id, {
                    step: 'SELECT_TITLE',
                    channelId: targetChannel.id,
                    guildId: targetChannel.guildId
                });

                const titleSelect = new StringSelectMenuBuilder()
                    .setCustomId('wizard_title_select')
                    .setPlaceholder('Wähle ein Event aus...')
                    .addOptions(PREDEFINED_EVENT_TITLES.map(item => 
                        new StringSelectMenuOptionBuilder()
                            .setLabel(item.label)
                            .setValue(item.value)
                            .setDescription(item.description)
                            .setEmoji(item.emoji)
                    ));

                const row = new ActionRowBuilder().addComponents(titleSelect);
                await dmChannel.send({ 
                    content: '📌 **Schritt 1/3:** Welches Event möchtest du planen?', 
                    components: [row] 
                });

            } catch (error) {
                console.error('Fehler beim Starten des Wizards:', error);
                await interaction.reply({ content: '❌ Konnte keine Direktnachricht senden.', ephemeral: true });
            }
        } 
        
        else if (interaction.commandName === 'dashboard') {
            await interaction.deferReply({ ephemeral: true });

            const dashboardEmbed = new EmbedBuilder()
                .setTitle('📋 Shugo-Eventplaner Dashboard (Live)')
                .setDescription('Übersicht aller aktuell aktiven Events auf dem Server.')
                .setColor(0xFFD700)
                .setTimestamp();

            if (activeEvents.size === 0) {
                dashboardEmbed.addFields({ name: 'Aktive Events', value: '*Derzeit sind keine Events geplant.*' });
            } else {
                let eventListText = '';
                for (const [msgId, ev] of activeEvents.entries()) {
                    const signupCount = ev.signups.size;
                    
                    const classCounts = {};
                    for (const data of ev.signups.values()) {
                        classCounts[data.emoji] = (classCounts[data.emoji] || 0) + 1;
                    }

                    const emojiList = Object.entries(classCounts)
                        .map(([emoji, count]) => `${emoji} ${count}x`)
                        .join(' ');

                    const signupStatus = emojiList.length > 0 
                        ? `${emojiList} (${signupCount}/5)` 
                        : `(${signupCount}/5)`;

                    eventListText += `• **${ev.title}** ${signupStatus} um *${ev.time}* (Erstellt von ${ev.creator}) - [Zum Event](https://discord.com/channels/${interaction.guildId}/${ev.channelId}/${msgId})\n`;
                }
                dashboardEmbed.addFields({ name: 'Geplante Events', value: eventListText });
            }

            const refreshBtn = new ButtonBuilder()
                .setCustomId('dashboard_refresh_btn')
                .setLabel('🔄 Dashboard aktualisieren')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(refreshBtn);

            const dashMessage = await interaction.channel.send({ embeds: [dashboardEmbed], components: [row] });
            await dashMessage.pin().catch(() => {});

            activeDashboards.set(interaction.channelId, dashMessage.id);

            await interaction.editReply({ content: '✅ Live-Dashboard erfolgreich erstellt!' });
        }
    }

    if (interaction.isStringSelectMenu()) {
        const userId = interaction.user.id;
        const session = wizardSessions.get(userId);

        if (interaction.customId === 'wizard_title_select' && session) {
            const selectedVal = interaction.values[0];

            if (selectedVal === 'CUSTOM_TITLE') {
                session.step = 'INPUT_CUSTOM_TITLE';
                await interaction.update({ content: '✏️ Du hast **Eigener Titel** gewählt.', components: [] });
                await interaction.user.send({ content: 'Bitte schreibe jetzt deinen **gewünschten Event-Namen** in den Chat:' });
            } else {
                session.title = selectedVal;
                session.step = 'INPUT_TIME';
                await interaction.update({ content: `✅ Titel gewählt: **${session.title}**`, components: [] });
                await interaction.user.send({ 
                    content: '🕒 **Schritt 2/3:** Wann findet das Event statt?\n*(Bitte im Chat schreiben, z.B. 25.10.2026 20:00)*' 
                });
            }
        }

        // Klassenauswahl im Event-Kanal (Anmeldung)
        else if (interaction.customId === 'select_class') {
            const messageId = interaction.message.id;
            const eventData = activeEvents.get(messageId);

            if (!eventData) {
                return interaction.reply({ content: '❌ Event nicht gefunden.', ephemeral: true });
            }

            const selectedClass = interaction.values[0];
            const emojis = {
                'Magier': '🔥', 'Templer': '🛡️', 'Gladiator': '⚔️', 'Assasine': '🗡️',
                'Waldläufer': '🏹', 'Beschwörer': '👻', 'Kleriker': '❤️', 'Kantor': '⚜️'
            };
            const emoji = emojis[selectedClass] || '📌';

            eventData.signups.set(interaction.user.id, {
                tag: `<@${interaction.user.id}>`,
                className: selectedClass,
                emoji: emoji
            });

            let signupText = '';
            for (const data of eventData.signups.values()) {
                signupText += `${data.emoji} **${data.className}**: ${data.tag}\n`;
            }
            if (signupText === '') signupText = '*Noch keine Anmeldungen*';

            const updatedEmbed = new EmbedBuilder()
                .setTitle(`📅 Event: ${eventData.title}`)
                .setDescription(eventData.description)
                .setColor(0x0099FF)
                .addFields(
                    { name: '🕒 Datum / Uhrzeit', value: eventData.time, inline: true },
                    { name: '👑 Erstellt von', value: eventData.creator, inline: true },
                    { name: '👥 Aufstellung / Anmeldungen', value: signupText, inline: false }
                )
                .setFooter({ text: 'Shugo-Eventplaner v7.3 - Wähle deine Klasse unten aus.' })
                .setTimestamp();

            await interaction.update({ embeds: [updatedEmbed] });

            // Dashboard in Echtzeit aktualisieren bei Anmeldung
            await updateAllDashboards();
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'event_decline') {
            const messageId = interaction.message.id;
            const eventData = activeEvents.get(messageId);

            if (!eventData) return interaction.reply({ content: '❌ Event nicht gefunden.', ephemeral: true });

            if (eventData.signups.has(interaction.user.id)) {
                eventData.signups.delete(interaction.user.id);

                let signupText = '';
                for (const data of eventData.signups.values()) {
                    signupText += `${data.emoji} **${data.className}**: ${data.tag}\n`;
                }
                if (signupText === '') signupText = '*Noch keine Anmeldungen*';

                const updatedEmbed = new EmbedBuilder()
                    .setTitle(`📅 Event: ${eventData.title}`)
                    .setDescription(eventData.description)
                    .setColor(0x0099FF)
                    .addFields(
                        { name: '🕒 Datum / Uhrzeit', value: eventData.time, inline: true },
                        { name: '👑 Erstellt von', value: eventData.creator, inline: true },
                        { name: '👥 Aufstellung / Anmeldungen', value: signupText, inline: false }
                    )
                    .setFooter({ text: 'Shugo-Eventplaner v7.3 - Wähle deine Klasse unten aus.' })
                    .setTimestamp();

                await interaction.update({ embeds: [updatedEmbed] });

                // Dashboard in Echtzeit aktualisieren bei Abmeldung
                await updateAllDashboards();
            } else {
                await interaction.reply({ content: 'Du stehst auf keiner Anmeldeliste.', ephemeral: true });
            }
        }

        else if (interaction.customId.startsWith('creator_delete_')) {
            const targetMsgId = interaction.customId.replace('creator_delete_', '');
            const eventData = activeEvents.get(targetMsgId);

            if (!eventData) return interaction.reply({ content: '❌ Event existiert nicht mehr.', ephemeral: true });

            try {
                const channel = await client.channels.fetch(eventData.channelId).catch(() => null);
                if (channel) {
                    const msg = await channel.messages.fetch(targetMsgId).catch(() => null);
                    if (msg) await msg.delete().catch(() => null);
                }
            } catch (err) {}

            activeEvents.delete(targetMsgId);
            await updateAllDashboards();
            await interaction.update({ content: '🗑️ Event wurde erfolgreich gelöscht.', components: [] });
        }

        else if (interaction.customId === 'dashboard_refresh_btn' || interaction.customId === 'dm_refresh_dashboard') {
            await updateAllDashboards();
            await interaction.reply({ content: '🔄 Dashboard wurde aktualisiert!', ephemeral: true });
        }
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.guild) return;

    const userId = message.author.id;
    const session = wizardSessions.get(userId);
    if (!session) return;

    if (session.step === 'INPUT_CUSTOM_TITLE') {
        session.title = message.content.trim();
        session.step = 'INPUT_TIME';

        await message.reply('✅ Eigener Titel gespeichert!\n\n🕒 **Schritt 2/3:** Wann findet das Event statt?\n*(Bitte im Chat schreiben, z.B. 25.10.2026 20:00)*');
    }

    else if (session.step === 'INPUT_TIME') {
        session.timeStr = message.content.trim();
        session.step = 'INPUT_DESC';

        await message.reply('📝 **Schritt 3/3:** Bitte schreibe nun noch eine kurze Beschreibung oder Taktik in den Chat:');
    }

    else if (session.step === 'INPUT_DESC') {
        const eventDesc = message.content.trim();
        
        let expireTimestamp = null;
        try {
            const parts = session.timeStr.trim().split(/\s+/);
            const datePart = parts[0]; 
            const timePart = parts[1]; 

            const [day, month, year] = datePart.split('.');
            const [hour, minute] = timePart.split(':');

            const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`;
            expireTimestamp = new Date(isoString).getTime();
        } catch (e) {
            console.error('Fehler beim Parsen des Auto-Delete Timestamps:', e);
        }

        try {
            const targetChannel = await client.channels.fetch(session.channelId);
            
            const eventEmbed = new EmbedBuilder()
                .setTitle(`📅 Event: ${session.title}`)
                .setDescription(eventDesc)
                .setColor(0x0099FF)
                .addFields(
                    { name: '🕒 Datum / Uhrzeit', value: session.timeStr, inline: true },
                    { name: '👑 Erstellt von', value: `<@${userId}>`, inline: true },
                    { name: '👥 Aufstellung / Anmeldungen', value: '*Noch keine Anmeldungen*', inline: false }
                )
                .setFooter({ text: 'Shugo-Eventplaner v7.3 - Wähle deine Klasse unten aus.' })
                .setTimestamp();

            const classSelectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_class')
                .setPlaceholder('Melde dich mit deiner Klasse an...')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('Magier').setValue('Magier').setEmoji('🔥'),
                    new StringSelectMenuOptionBuilder().setLabel('Templer').setValue('Templer').setEmoji('🛡️'),
                    new StringSelectMenuOptionBuilder().setLabel('Gladiator').setValue('Gladiator').setEmoji('⚔️'),
                    new StringSelectMenuOptionBuilder().setLabel('Assasine').setValue('Assasine').setEmoji('🗡️'),
                    new StringSelectMenuOptionBuilder().setLabel('Waldläufer').setValue('Waldläufer').setEmoji('🏹'),
                    new StringSelectMenuOptionBuilder().setLabel('Beschwörer').setValue('Beschwörer').setEmoji('👻'),
                    new StringSelectMenuOptionBuilder().setLabel('Kleriker').setValue('Kleriker').setEmoji('❤️'),
                    new StringSelectMenuOptionBuilder().setLabel('Kantor').setValue('Kantor').setEmoji('⚜️')
                );

            const declineButton = new ButtonBuilder()
                .setCustomId('event_decline')
                .setLabel('Austragen / Absagen')
                .setStyle(ButtonStyle.Danger);

            const rowMenu = new ActionRowBuilder().addComponents(classSelectMenu);
            const rowButton = new ActionRowBuilder().addComponents(declineButton);

            const sentMessage = await targetChannel.send({ 
                embeds: [eventEmbed], 
                components: [rowMenu, rowButton] 
            });

            activeEvents.set(sentMessage.id, {
                title: session.title,
                description: eventDesc,
                time: session.timeStr,
                creator: `<@${userId}>`,
                creatorId: userId,
                channelId: session.channelId,
                guildId: session.guildId,
                expireTimestamp: expireTimestamp,
                signups: new Map()
            });

            await updateAllDashboards();

            const deleteBtn = new ButtonBuilder()
                .setCustomId(`creator_delete_${sentMessage.id}`)
                .setLabel('🗑️ Event löschen')
                .setStyle(ButtonStyle.Danger);

            const refreshBtn = new ButtonBuilder()
                .setCustomId('dm_refresh_dashboard')
                .setLabel('🔄 Dashboard aktualisieren')
                .setStyle(ButtonStyle.Secondary);

            const adminRow = new ActionRowBuilder().addComponents(deleteBtn, refreshBtn);

            await message.reply({ 
                content: `✅ Dein Event **"${session.title}"** wurde erfolgreich im Kanal veröffentlicht!\nDu kannst es hier verwalten:`, 
                components: [adminRow] 
            });

        } catch (err) {
            console.error('Fehler bei der Event-Finalisierung:', err);
            await message.reply('❌ Ein Fehler ist aufgetreten. Konnte das Event nicht im Kanal posten.');
        }

        wizardSessions.delete(userId);
    }
});

client.login(process.env.DISCORD_TOKEN);
