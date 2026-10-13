// ==========================================
// Projekt: Shugo-Eventplaner (Version 5.0)
// Beschreibung: Mit direktem Modal für /event-create, Live-Dashboard, Auto-Delete & Ersteller-Löschbutton
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

const activeEvents = new Map();
const activeDashboards = new Map();

const commands = [
    new SlashCommandBuilder()
        .setName('event-create')
        .setDescription('Öffnet das Formular zur Erstellung eines neuen Events.'),
    new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('Postet oder aktualisiert das Live-Event-Dashboard in diesem Kanal.')
];

// Live-Dashboard Aktualisierungsfunktion
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
}, 30000);

client.once('ready', async () => {
    console.log(`[Shugo-Eventplaner v5.0] Bot ist eingeloggt als ${client.user.tag}!`);
    try {
        await client.application.commands.set(commands);
        console.log('Slash Commands erfolgreich registriert.');
    } catch (error) {
        console.error('Fehler beim Registrieren der Slash Commands:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        // 1. Befehl: /event-create öffnet direkt das Modal (Formular)
        if (interaction.commandName === 'event-create') {
            const modal = new ModalBuilder()
                .setCustomId('event_create_modal')
                .setTitle('Neues Event erstellen');

            const titleInput = new TextInputBuilder()
                .setCustomId('title_input')
                .setLabel('Event-Titel')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('z.B. Dredgion, Tiamat Festung, Event 1...')
                .setRequired(true);

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
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(timeInput),
                new ActionRowBuilder().addComponents(descInput)
            );

            await interaction.showModal(modal);
        } 
        
        // 2. Befehl: /dashboard
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

            activeDashboards.set(interaction.channelId, dashMessage.id);

            await interaction.editReply({ content: '✅ Live-Dashboard wurde erfolgreich erstellt und angepinnt!' });
        }
    }

    // Modal Absenden verarbeiten
    if (interaction.isModalSubmit() && interaction.customId === 'event_create_modal') {
        const eventTitle = interaction.fields.getTextInputValue('title_input');
        const eventTimeStr = interaction.fields.getTextInputValue('time_input');
        const eventDesc = interaction.fields.getTextInputValue('desc_input');
        const targetChannel = interaction.channel;

        await interaction.reply({ content: '✅ Event wird im Kanal veröffentlicht...', ephemeral: true });

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
            .setFooter({ text: 'Shugo-Eventplaner v5.0 - Wähle deine Klasse unten aus.' })
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

        await updateAllDashboards();

        // Dem Ersteller einen Lösch-Button per DM schicken
        try {
            const dmChannel = await interaction.user.createDM();
            const deleteButton = new ButtonBuilder()
                .setCustomId(`creator_delete_${sentMessage.id}`)
                .setLabel('🗑️ Event jetzt löschen')
                .setStyle(ButtonStyle.Danger);

            await dmChannel.send({ 
                content: `Dein Event **"${eventTitle}"** wurde erfolgreich im Kanal erstellt. Du kannst es hier jederzeit vorzeitig löschen:`, 
                components: [new ActionRowBuilder().addComponents(deleteButton)] 
            });
        } catch (err) {
            console.log('Konnte dem Ersteller keine DM senden.');
        }
    }

    // Klassenauswahl (Dropdown) im Event-Kanal
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
            .setFooter({ text: 'Shugo-Eventplaner v5.0 - Wähle deine Klasse unten aus.' })
            .setTimestamp();

        await interaction.update({ embeds: [updatedEmbed] });
    }

    // Absagen / Austragen Button
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
                .setFooter({ text: 'Shugo-Eventplaner v5.0 - Wähle deine Klasse unten aus.' })
                .setTimestamp();

            await interaction.update({ embeds: [updatedEmbed] });
        } else {
            await interaction.reply({ content: 'Du stehst derzeit auf keiner Anmeldeliste für dieses Event.', ephemeral: true });
        }
    }

    // Manueller Lösch-Button für den Ersteller per DM
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
