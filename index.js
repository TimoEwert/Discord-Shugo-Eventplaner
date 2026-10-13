// ==========================================
// Projekt: Shugo-Eventplaner (Version 3.0)
// Beschreibung: Mit vordefinierten Event-Titeln, Dashboard, Auto-Delete & strukturiertem Ablauf
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

// Zentraler Speicher für Events
const activeEvents = new Map();

// Vordefinierte Event-Titel (hier kannst du sie jederzeit anpassen/erweitern)
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

// Hintergrund-Check im Minutentakt für abgelaufene Events (Auto-Delete)
setInterval(async () => {
    const now = Date.now();
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
            console.log(`[Auto-Delete] Event "${eventData.title}" wurde nach Ablauf entfernt.`);
        }
    }
}, 60000);

client.once('ready', async () => {
    console.log(`[Shugo-Eventplaner v3.0] Bot ist eingeloggt als ${client.user.tag}!`);
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

                // Titel-Auswahl über Dropdown in der DM
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

                // Datum & Uhrzeit Abfrage
                const filterMsg = m => m.author.id === interaction.user.id;
                await dmChannel.send('🕒 **Schritt 2/3:** Wann findet das Event statt?\n*(Bitte im Format **TT.MM.JJJJ HH:MM** eingeben, z.B. `25.10.2026 20:00`)*');
                
                const collectedTime = await dmChannel.awaitMessages({ filter: filterMsg, max: 1, time: 60000 });
                if (!collectedTime.size) return dmChannel.send('⏳ Zeitüberschreitung. abgebrochen.');
                const eventTimeStr = collectedTime.first().content;

                let expireTimestamp = null;
                try {
                    const [datePart, timePart] = eventTimeStr.split(' ');
                    const [day, month, year] = datePart.split('.');
                    const [hour, minute] = timePart.split(':');
                    expireTimestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`).getTime();
                } catch (e) {
                    console.log('Konnte Datum nicht für Auto-Delete parsen.');
                }

                // Beschreibung
                await dmChannel.send('📝 **Schritt 3/3:** Bitte gib eine kurze **Beschreibung** oder Taktik-Hinweise ein:');
                const collectedDesc = await dmChannel.awaitMessages({ filter: filterMsg, max: 1, time: 120000 });
                if (!collectedDesc.size) return dmChannel.send('⏳ Zeitüberschreitung. abgebrochen.');
                const eventDesc = collectedDesc.first().content;

                await dmChannel.send('✅ **Fertig!** Das Event wird im Kanal veröffentlicht.');

                const eventEmbed = new EmbedBuilder()
                    .setTitle(`📅 Event: ${eventTitle}`)
                    .setDescription(eventDesc)
                    .setColor(0x0099FF)
                    .addFields(
                        { name: '🕒 Datum / Uhrzeit', value: eventTimeStr, inline: true },
                        { name: '👑 Erstellt von', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '👥 Aufstellung / Anmeldungen', value: '*Noch keine Anmeldungen*', inline: false }
                    )
                    .setFooter({ text: 'Shugo-Eventplaner v3.0 - Wähle deine Klasse unten aus.' })
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
                    channelId: targetChannel.id,
                    expireTimestamp: expireTimestamp,
                    signups: new Map()
                });

            } catch (error) {
                console.error('Fehler bei der Event-Erstellung:', error);
            }
        } 
        
        else if (interaction.commandName === 'dashboard') {
            await interaction.deferReply({ ephemeral: true });

            const dashboardEmbed = new EmbedBuilder()
                .setTitle('📋 Shugo-Eventplaner Dashboard')
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

            await interaction.editReply({ content: '✅ Dashboard wurde erfolgreich in diesem Kanal erstellt und angepinnt!' });
        }
    }

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
            .setFooter({ text: 'Shugo-Eventplaner v3.0 - Wähle deine Klasse unten aus.' })
            .setTimestamp();

        await interaction.update({ embeds: [updatedEmbed] });
    }

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
                .setFooter({ text: 'Shugo-Eventplaner v3.0 - Wähle deine Klasse unten aus.' })
                .setTimestamp();

            await interaction.update({ embeds: [updatedEmbed] });
        } else {
            await interaction.reply({ content: 'Du stehst derzeit auf keiner Anmeldeliste für dieses Event.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
