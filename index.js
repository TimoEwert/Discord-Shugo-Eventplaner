// ==========================================
// Projekt: Shugo-Eventplaner (Version 4.0)
// Beschreibung: Mit Modal für Datum/Zeit, Live-Dashboard, Auto-Delete & Admin-Löschbutton
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
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Zentraler Speicher für Events
const activeEvents = new Map(); // messageId -> EventData
// Speichert Dashboard-Nachrichten pro Kanal: channelId -> dashboardMessageId
const activeDashboards = new Map();

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

// Hilfsfunktion: Dashboard in allen aktiven Kanälen live aktualisieren
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

            await dashMsg.edit({ embeds: [dashboardEmbed] });
        } catch (err) {
            console.error('Fehler beim Aktualisieren des Dashboards:', err);
        }
    }
}

// Hintergrund-Check für Auto-Delete nach Ablauf der Startzeit
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
                console.error('Fehler beim automatischen Löschen des Events:', err);
            }
            activeEvents.delete(messageId);
            changed = true;
            console.log(`[Auto-Delete] Event "${eventData.title}" wurde nach Ablauf entfernt.`);
        }
    }

    if (changed) {
        await updateAllDashboards();
    }
}, 30000); // Prüft alle 30 Sekunden

client.once('ready', async () => {
    console.log(`[Shugo-Eventplaner v4.0] Bot ist eingeloggt als ${client.user.tag}!`);
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

                // Schritt 1: Titel per Dropdown in DM
                const titleSelect = new StringSelectMenuBuilder()
                    .setCustomId('wizard_select_title')
                    .setPlaceholder('Wähle das Event aus...')
                    .addOptions(PREDEFINED_EVENT_TITLES.map(item => 
                        new StringSelectMenuOptionBuilder()
                            .setLabel(item.label)
                            .setValue(item.value)
                            .setDescription(item.description)
                            .setEmoji(item.emoji)
                    ));

                const titleRow = new ActionRowBuilder().addComponents(titleSelect);
                
                await dmChannel.send({ 
                    content: '📌 **Schritt 1/3:** Welches Event möchtest du planen?', 
                    components: [titleRow] 
                });

                const filter = i => i.user.id === interaction.user.id;
                const titleInteraction = await dmChannel.awaitMessageComponent({ filter, time: 60000 }).catch(() => null);
                if (!titleInteraction) {
                    return dmChannel.send('⏳ Zeitüberschreitung. Die Event-Erstellung wurde abgebrochen.');
                }
                const eventTitle = titleInteraction.values[0];
                await titleInteraction.update({ content: `✅ Event-Titel gewählt: **${eventTitle}**`, components: [] });

                // Schritt 2: Datum & Uhrzeit über ein Discord Modal (Formular) abfragen
                const modalId = `event_modal_${interaction.user.id}_${Date.now()}`;
                const modal = new ModalBuilder()
                    .setCustomId(modalId)
                    .setTitle('Event-Details & Zeitpunkt');

                const timeInput = new TextInputBuilder()
                    .setCustomId('time_input')
                    .setLabel('Datum & Uhrzeit (TT.MM.JJJJ HH:MM)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('z.B. 25.10.2026 20:00')
                    .setRequired(true);

                const descInput = new TextInputBuilder()
                    .setCustomId('desc_input')
                    .setLabel('Beschreibung / Taktik-Hinweise')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Kurze Infos zum Ablauf...')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(timeInput),
                    new ActionRowBuilder().addComponents(descInput)
                );

                // Da man Modals nur auf Slash Commands direkt legen kann, schicken wir hierzu eine Aufforderung oder nutzen einen Button
                await dmChannel.send('🕒 **Schritt 2 & 3:** Klicke auf den Button unten, um Datum, Uhrzeit und Beschreibung im Formular einzutragen.');
                
                const modalButton = new ButtonBuilder()
                    .setCustomId(`open_modal_${modalId}`)
                    .setLabel('Formular öffnen')
                    .setStyle(ButtonStyle.Primary);

                const btnRow = new ActionRowBuilder().addComponents(modalButton);
                const modalPromptMsg = await dmChannel.send({ components: [btnRow] });

                // Warten bis der User den Button klickt
                const btnInteraction = await dmChannel.awaitMessageComponent({ 
                    filter: i => i.user.id === interaction.user.id && i.customId === `open_modal_${modalId}`, 
                    time: 60000 
                }).catch(() => null);

                if (!btnInteraction) {
                    return dmChannel.send('⏳ Zeitüberschreitung. abgebrochen.');
                }

                await btnInteraction.showModal(modal);

                // Auf das Absenden des Modals warten
                const modalSubmission = await btnInteraction.awaitModalSubmit({ 
                    filter: i => i.user.id === interaction.user.id && i.customId === modalId, 
                    time: 120000 
                }).catch(() => null);

                if (!modalSubmission) {
                    return dmChannel.send('⏳ Zeitüberschreitung beim Formular.');
                }

                const eventTimeStr = modalSubmission.fields.getTextInputValue('time_input');
                const eventDesc = modalSubmission.fields.getTextInputValue('desc_input');

                await modalSubmission.reply({ content: '✅ **Daten erhalten!** Das Event wird veröffentlicht.', ephemeral: true });

                // Timestamp für automatisches Löschen berechnen
                let expireTimestamp = null;
                try {
                    const [datePart, timePart] = eventTimeStr.split(' ');
                    const [day, month, year] = datePart.split('.');
                    const [hour, minute] = timePart.split(':');
                    expireTimestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`).getTime();
                } catch (e) {
                    console.log('Konnte Datum nicht für Auto-Delete parsen.');
                }

                const eventEmbed = new EmbedBuilder()
                    .setTitle(`📅 Event: ${eventTitle}`)
                    .setDescription(eventDesc)
                    .setColor(0x0099FF)
                    .addFields(
                        { name: '🕒 Datum / Uhrzeit', value: eventTimeStr, inline: true },
                        { name: '👑 Erstellt von', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '👥 Aufstellung / Anmeldungen', value: '*Noch keine Anmeldungen*', inline: false }
                    )
                    .setFooter({ text: 'Shugo-Eventplaner v4.0 - Wähle deine Klasse unten aus.' })
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

                // In Map speichern
                activeEvents.set(sentMessage.id, {
                    title: eventTitle,
                    description: eventDesc,
                    time: eventTimeStr,
                    creator: `<@${interaction.user.id}>`,
                    creatorId: interaction.user.id,
                    channelId: targetChannel.id,
                    guildId: targetChannel.guildId,
                    expireTimestamp: expireTimestamp,
                    signups: new Map()
                });

                // Live Dashboards aktualisieren
                await updateAllDashboards();

                // Dem Ersteller in der DM einen Lösch-Button für sein Event bereitstellen
                const deleteButton = new ButtonBuilder()
                    .setCustomId(`creator_delete_${sentMessage.id}`)
                    .setLabel('🗑️ Event jetzt löschen')
                    .setStyle(ButtonStyle.Danger);

                await dmChannel.send({ 
                    content: `Dein Event **"${eventTitle}"** wurde erfolgreich im Kanal erstellt. Du kannst es hier jederzeit vorzeitig löschen:`, 
                    components: [new ActionRowBuilder().addComponents(deleteButton)] 
                });

            } catch (error) {
                console.error('Fehler bei der Event-Erstellung:', error);
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

            const dashMessage = await interaction.channel.send({ embeds: [dashboardEmbed] });
            await dashMessage.pin().catch(() => {});

            // Kanal für automatische Live-Updates merken
            activeDashboards.set(interaction.channelId, dashMessage.id);

            await interaction.editReply({ content: '✅ Live-Dashboard wurde erfolgreich erstellt und angepinnt!' });
        }
    }

    // Klassenauswahl im Event-Kanal
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_class') {
        const messageId = interaction.message.id;
        const eventData = activeEvents.get(messageId);

        if (!eventData) {
            return interaction.reply({ content: '❌ Dieses Event konnte im Speicher nicht gefunden werden.', ephemeral: true });
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
            .setFooter({ text: 'Shugo-Eventplaner v4.0 - Wähle deine Klasse unten aus.' })
            .setTimestamp();

        await interaction.update({ embeds: [updatedEmbed] });
    }

    // Absagen / Austragen Button im Event-Kanal
    if (interaction.isButton() && interaction.customId === 'event_decline') {
        const messageId = interaction.message.id;
        const eventData = activeEvents.get(messageId);

        if (!eventData) {
            return interaction.reply({ content: '❌ Event nicht gefunden.', ephemeral: true });
        }

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
                .setFooter({ text: 'Shugo-Eventplaner v4.0 - Wähle deine Klasse unten aus.' })
                .setTimestamp();

            await interaction.update({ embeds: [updatedEmbed] });
        } else {
            await interaction.reply({ content: 'Du stehst derzeit auf keiner Anmeldeliste für dieses Event.', ephemeral: true });
        }
    }

    // Manueller Lösch-Button für den Ersteller in den DMs
    if (interaction.isButton() && interaction.customId.startsWith('creator_delete_')) {
        const targetMsgId = interaction.customId.replace('creator_delete_', '');
        const eventData = activeEvents.get(targetMsgId);

        if (!eventData) {
            return interaction.reply({ content: '❌ Dieses Event existiert nicht mehr oder wurde bereits gelöscht.', ephemeral: true });
        }

        if (eventData.creatorId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Du bist nicht der Ersteller dieses Events.', ephemeral: true });
        }

        try {
            const channel = await client.channels.fetch(eventData.channelId).catch(() => null);
            if (channel) {
                const msg = await channel.messages.fetch(targetMsgId).catch(() => null);
                if (msg) await msg.delete().catch(() => null);
            }
        } catch (err) {
            console.error('Fehler beim manuellen Löschen:', err);
        }

        activeEvents.delete(targetMsgId);
        await updateAllDashboards();

        await interaction.update({ content: '🗑️ Das Event wurde erfolgreich gelöscht und aus dem Dashboard entfernt.', components: [] });
    }
});

client.login(process.env.DISCORD_TOKEN);
