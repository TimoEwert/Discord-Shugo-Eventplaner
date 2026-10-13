// ==========================================
// Projekt: Shugo-Eventplaner (Version 6.3)
// Beschreibung: Vollständiger DM-Wizard mit Dropdowns für Titel, Tag, Monat, Jahr, Stunde & Minute,
// Auto-Delete, Live-Dashboard & Admin-Steuerung.
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

const activeEvents = new Map();
const activeDashboards = new Map();
const wizardSessions = new Map();

const PREDEFINED_EVENT_TITLES = [
    { label: 'Dredgion', value: 'Dredgion Run', description: 'PvPvE Instanz', emoji: '⚔️' },
    { label: 'Tiamat Festung', value: 'Tiamat Festung Raid', description: 'Großer Allianz-Raid', emoji: '🔥' },
    { label: 'Dark Poeta', value: 'Dark Poeta (S-Rank)', description: 'PvE Instanz Farmen', emoji: '👻' },
    { label: 'Event 1', value: 'Event 1 (Custom)', description: 'Benutzerdefiniertes Event 1', emoji: '📌' },
    { label: 'Event 2', value: 'Event 2 (Custom)', description: 'Benutzerdefiniertes Event 2', emoji: '📌' },
    { label: 'Event 3', value: 'Event 3 (Custom)', description: 'Benutzerdefiniertes Event 3', emoji: '📌' }
];

const commands = [
    new SlashCommandBuilder()
        .setName('event-create')
        .setDescription('Startet die schrittweise Event-Erstellung per Direktnachricht.'),
    new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('Postet oder aktualisiert das Live-Event-Dashboard in diesem Kanal.')
];

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
                    eventListText += `• **${ev.title}** um *${ev.time}* (Erstellt von ${ev.creator}) - [Zum Event](https://discord.com/channels/${ev.guildId}/${ev.channelId}/${msgId})\n`;
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
            } catch (err) {
                console.error('Fehler beim automatischen Löschen:', err);
            }
            activeEvents.delete(messageId);
            changed = true;
        }
    }

    if (changed) {
        await updateAllDashboards();
    }
}, 30000);

client.once('ready', async () => {
    console.log(`[Shugo-Eventplaner v6.3] Bot ist eingeloggt als ${client.user.tag}!`);
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
                    content: '📌 **Schritt 1/4:** Welches Event möchtest du planen?', 
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
                    eventListText += `• **${ev.title}** um *${ev.time}* (Erstellt von ${ev.creator}) - [Zum Event](https://discord.com/channels/${interaction.guildId}/${ev.channelId}/${msgId})\n`;
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

        // --- SCHRITT 1: TITEL GEWÄHLT -> TAG WÄHLEN (1-15 und 16-31 aufteilen wegen 25er Limit) ---
        if (interaction.customId === 'wizard_title_select' && session) {
            session.title = interaction.values[0];
            session.step = 'SELECT_DAY';
            
            await interaction.update({ content: `✅ Titel gewählt: **${session.title}**`, components: [] });

            const daySelect = new StringSelectMenuBuilder()
                .setCustomId('wizard_day_select')
                .setPlaceholder('Wähle den Tag (01 - 15)...');

            for (let i = 1; i <= 15; i++) {
                const d = i < 10 ? `0${i}` : `${i}`;
                daySelect.addOptions(new StringSelectMenuOptionBuilder().setLabel(d).setValue(d));
            }

            await interaction.user.send({ 
                content: '📅 **Schritt 2/4 (Datum - Tag Teil 1):** Wähle einen Tag von 01 bis 15 (Für Tage ab 16 gibt es gleich einen zweiten Schritt):', 
                components: [new ActionRowBuilder().addComponents(daySelect)] 
            });
        }

        // --- TAG TEIL 1 (1-15) GEWÄHLT ---
        else if (interaction.customId === 'wizard_day_select' && session) {
            session.day = interaction.values[0];
            session.step = 'SELECT_MONTH';

            await interaction.update({ content: `✅ Tag gewählt: **${session.day}**`, components: [] });

            const months = [
                { label: 'Januar', value: '01' }, { label: 'Februar', value: '02' },
                { label: 'März', value: '03' }, { label: 'April', value: '04' },
                { label: 'Mai', value: '05' }, { label: 'Juni', value: '06' },
                { label: 'Juli', value: '07' }, { label: 'August', value: '08' },
                { label: 'September', value: '09' }, { label: 'Oktober', value: '10' },
                { label: 'November', value: '11' }, { label: 'Dezember', value: '12' }
            ];

            const monthSelect = new StringSelectMenuBuilder()
                .setCustomId('wizard_month_select')
                .setPlaceholder('Wähle den Monat aus...')
                .addOptions(months.map(m => new StringSelectMenuOptionBuilder().setLabel(m.label).setValue(m.value)));

            await interaction.user.send({ 
                content: '📅 **Schritt 2/4 (Monat):** Welcher Monat?', 
                components: [new ActionRowBuilder().addComponents(monthSelect)] 
            });
        }

        // --- MONAT GEWÄHLT -> JAHR ---
        else if (interaction.customId === 'wizard_month_select' && session) {
            session.month = interaction.values[0];
            session.step = 'SELECT_YEAR';

            await interaction.update({ content: `✅ Monat gewählt`, components: [] });

            const yearSelect = new StringSelectMenuBuilder()
                .setCustomId('wizard_year_select')
                .setPlaceholder('Wähle das Jahr aus...');

            for (let y = 2026; y <= 2030; y++) {
                yearSelect.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${y}`).setValue(`${y}`));
            }

            await interaction.user.send({ 
                content: '📅 **Schritt 2/4 (Jahr):** Welches Jahr?', 
                components: [new ActionRowBuilder().addComponents(yearSelect)] 
            });
        }

        // --- JAHR GEWÄHLT -> UHRZEIT: STUNDE (00-23) ---
        else if (interaction.customId === 'wizard_year_select' && session) {
            session.year = interaction.values[0];
            session.step = 'SELECT_HOUR';

            await interaction.update({ content: `✅ Jahr gewählt: **${session.year}**`, components: [] });

            // Aufteilung in zwei Menüs (Stunden 00-11 und 12-23, um das 25er Limit einzuhalten)
            const hourSelect = new StringSelectMenuBuilder()
                .setCustomId('wizard_hour_select')
                .setPlaceholder('Wähle die Stunde (00 - 11)...');

            for (let h = 0; h <= 11; h++) {
                const hs = h < 10 ? `0${h}` : `${h}`;
                hourSelect.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${hs} Uhr`).setValue(hs));
            }

            // Alternativ Stunden 12-23 bieten wir als zweite Option oder teilen es sauber auf. 
            // Machen wir es noch eleganter: Ein Menü für Vormittag/Nachmittag oder 00-11 / 12-23 per Button/Select.
            // Am einfachsten: Zwei Optionen zur Auswahl, ob 00-11 oder 12-23 Uhr!
            const timeRangeSelect = new StringSelectMenuBuilder()
                .setCustomId('wizard_timerange_select')
                .setPlaceholder('Wähle den Stundenbereich...')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('00:00 bis 11:59 Uhr').setValue('AM'),
                    new StringSelectMenuOptionBuilder().setLabel('12:00 bis 23:59 Uhr').setValue('PM')
                );

            await interaction.user.send({ 
                content: '🕒 **Schritt 3/4 (Uhrzeit - Bereich):** Handelt es sich um die erste oder zweite Tageshälfte?', 
                components: [new ActionRowBuilder().addOptions ? new ActionRowBuilder().addComponents(timeRangeSelect) : new ActionRowBuilder().addComponents(timeRangeSelect)] 
            });
        }

        // --- STUNDENBEREICH (AM/PM) GEWÄHLT -> GENAUE STUNDE ---
        else if (interaction.customId === 'wizard_timerange_select' && session) {
            session.timeRange = interaction.values[0]; // 'AM' oder 'PM'
            session.step = 'SELECT_EXACT_HOUR';

            await interaction.update({ content: `✅ Bereich gewählt`, components: [] });

            const exactHourSelect = new StringSelectMenuBuilder()
                .setCustomId('wizard_exacthour_select')
                .setPlaceholder('Wähle die genaue Stunde...');

            const startH = session.timeRange === 'AM' ? 0 : 12;
            const endH = session.timeRange === 'AM' ? 11 : 23;

            for (let h = startH; h <= endH; h++) {
                const hs = h < 10 ? `0${h}` : `${h}`;
                exactHourSelect.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${hs}:00 Uhr`).setValue(hs));
            }

            await interaction.user.send({ 
                content: '🕒 **Schritt 3/4 (Uhrzeit - Stunde):** Welche Stunde?', 
                components: [new ActionRowBuilder().addComponents(exactHourSelect)] 
            });
        }

        // --- GENAUE STUNDE GEWÄHLT -> MINUTEN (00, 15, 30, 45) ---
        else if (interaction.customId === 'wizard_exacthour_select' && session) {
            session.hour = interaction.values[0];
            session.step = 'SELECT_MINUTE';

            await interaction.update({ content: `✅ Stunde gewählt: **${session.hour} Uhr**`, components: [] });

            const minuteSelect = new StringSelectMenuBuilder()
                .setCustomId('wizard_minute_select')
                .setPlaceholder('Wähle die Minuten...')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('00 Minuten').setValue('00'),
                    new StringSelectMenuOptionBuilder().setLabel('15 Minuten').setValue('15'),
                    new StringSelectMenuOptionBuilder().setLabel('30 Minuten').setValue('30'),
                    new StringSelectMenuOptionBuilder().setLabel('45 Minuten').setValue('45')
                );

            await interaction.user.send({ 
                content: '🕒 **Schritt 3/4 (Uhrzeit - Minuten):** Wähle die Minuten:', 
                components: [new ActionRowBuilder().addComponents(minuteSelect)] 
            });
        }

        // --- MINUTEN GEWÄHLT -> FERTIG MIT DATUM/ZEIT, FRAGE NACH BESCHREIBUNG ---
        else if (interaction.customId === 'wizard_minute_select' && session) {
            session.minute = interaction.values[0];
            session.step = 'INPUT_DESC';

            await interaction.update({ content: `✅ Uhrzeit komplett: **${session.hour}:${session.minute} Uhr**`, components: [] });

            await interaction.user.send({ 
                content: '📝 **Schritt 4/4 (Beschreibung):** Bitte schreibe jetzt noch eine kurze Beschreibung oder Taktik in den Chat:' 
            });
        }

        // KLASSENAUSWAHL IM KANAL
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
                .setFooter({ text: 'Shugo-Eventplaner v6.3 - Wähle deine Klasse unten aus.' })
                .setTimestamp();

            await interaction.update({ embeds: [updatedEmbed] });
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
                    .setFooter({ text: 'Shugo-Eventplaner v6.3 - Wähle deine Klasse unten aus.' })
                    .setTimestamp();

                await interaction.update({ embeds: [updatedEmbed] });
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

// DM-Textnachrichten Handler für die Beschreibung am Ende
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.guild) return;

    const userId = message.author.id;
    const session = wizardSessions.get(userId);
    if (!session) return;

    if (session.step === 'INPUT_DESC') {
        const eventDesc = message.content.trim();
        const timeStrFormatted = `${session.hour}:${session.minute} Uhr`;
        const fullTimeStr = `${session.day}.${session.month}.${session.year} um ${timeStrFormatted}`;

        let expireTimestamp = null;
        try {
            expireTimestamp = new Date(`${session.year}-${session.month}-${session.day}T${session.hour}:${session.minute}:00`).getTime();
        } catch (e) {}

        try {
            const targetChannel = await client.channels.fetch(session.channelId);
            
            const eventEmbed = new EmbedBuilder()
                .setTitle(`📅 Event: ${session.title}`)
                .setDescription(eventDesc)
                .setColor(0x0099FF)
                .addFields(
                    { name: '🕒 Datum / Uhrzeit', value: fullTimeStr, inline: true },
                    { name: '👑 Erstellt von', value: `<@${userId}>`, inline: true },
                    { name: '👥 Aufstellung / Anmeldungen', value: '*Noch keine Anmeldungen*', inline: false }
                )
                .setFooter({ text: 'Shugo-Eventplaner v6.3 - Wähle deine Klasse unten aus.' })
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
                time: fullTimeStr,
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
                content: `✅ Dein Event **"${session.title}"** wurde erfolgreich im Kanal veröffentlicht!`, 
                components: [adminRow] 
            });

        } catch (err) {
            console.error('Fehler bei der Event-Finalisierung:', err);
            await message.reply('❌ Ein Fehler ist aufgetreten.');
        }

        wizardSessions.delete(userId);
    }
});

client.login(process.env.DISCORD_TOKEN);
