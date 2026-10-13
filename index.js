// ==========================================
// Projekt: Discord-Shugo-Eventplaner (Version 2.1)
// Datei: index.js
// Beschreibung: DM-Wizard mit voll funktionsfähiger Klassenauswahl & Teilnehmerliste
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

// Speicher für Event-Anmeldungen im Arbeitsspeicher: { messageId: { title, desc, time, creator, signups: { userId: { name, className, emoji } } } }
const activeEvents = new Map();

const commands = [
    new SlashCommandBuilder()
        .setName('event-create')
        .setDescription('Startet die schrittweise Event-Erstellung per Direktnachricht.')
];

client.once('ready', async () => {
    console.log(`[Discord-Shugo-Eventplaner v2.1] Bot ist eingeloggt als ${client.user.tag}!`);
    try {
        await client.application.commands.set(commands);
        console.log('Slash Commands erfolgreich registriert.');
    } catch (error) {
        console.error('Fehler beim Registrieren der Slash Commands:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    // 1. Slash Command Verarbeitung
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'event-create') {
            const targetChannel = interaction.channel;

            try {
                const dmChannel = await interaction.user.createDM();
                
                await interaction.reply({ 
                    content: 'Ich habe dir eine Direktnachricht geschickt, um das Event zu starten!', 
                    ephemeral: true 
                });

                // Schritt 1: Titel
                await dmChannel.send('📌 **Schritt 1/3:** Wie lautet der **Titel** des Events?');
                const filter = m => m.author.id === interaction.user.id;
                
                const collectedTitle = await dmChannel.awaitMessages({ filter, max: 1, time: 60000 });
                if (!collectedTitle.size) return dmChannel.send('⏳ Zeitüberschreitung. abgebrochen.');
                const eventTitle = collectedTitle.first().content;

                // Schritt 2: Zeit
                await dmChannel.send('🕒 **Schritt 2/3:** Wann findet das Event statt? (z.B. *Morgen um 20:00 Uhr*).');
                const collectedTime = await dmChannel.awaitMessages({ filter, max: 1, time: 60000 });
                if (!collectedTime.size) return dmChannel.send('⏳ Zeitüberschreitung. abgebrochen.');
                const eventTime = collectedTime.first().content;

                // Schritt 3: Beschreibung
                await dmChannel.send('📝 **Schritt 3/3:** Bitte gib eine kurze **Beschreibung** ein:');
                const collectedDesc = await dmChannel.awaitMessages({ filter, max: 1, time: 120000 });
                if (!collectedDesc.size) return dmChannel.send('⏳ Zeitüberschreitung. abgebrochen.');
                const eventDesc = collectedDesc.first().content;

                await dmChannel.send('✅ **Vielen Dank!** Das Event wird im Kanal veröffentlicht.');

                const eventEmbed = new EmbedBuilder()
                    .setTitle(`📅 Event: ${eventTitle}`)
                    .setDescription(eventDesc)
                    .setColor(0x0099FF)
                    .addFields(
                        { name: '🕒 Datum / Uhrzeit', value: eventTime, inline: true },
                        { name: '👑 Erstellt von', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '👥 Aufstellung / Anmeldungen', value: '*Noch keine Anmeldungen*', inline: false }
                    )
                    .setFooter({ text: 'Shugo-Eventplaner v2.1 - Wähle deine Klasse unten aus.' })
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

                // Event in der Map registrieren
                activeEvents.set(sentMessage.id, {
                    title: eventTitle,
                    description: eventDesc,
                    time: eventTime,
                    creator: `<@${interaction.user.id}>`,
                    signups: new Map() // Speichert userId -> { className, emoji }
                });

            } catch (error) {
                console.error('Fehler bei der Event-Erstellung:', error);
            }
        }
    }

    // 2. Dropdown-Menü oder Button Verarbeitung
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_class') {
        const messageId = interaction.message.id;
        const eventData = activeEvents.get(messageId);

        if (!eventData) {
            return interaction.reply({ content: '❌ Dieses Event konnte nicht im Speicher gefunden werden.', ephemeral: true });
        }

        const selectedClass = interaction.values[0];
        const emojis = {
            'Magier': '🔥',
            'Templer': '🛡️',
            'Gladiator': '⚔️',
            'Assasine': '🗡️',
            'Waldläufer': '🏹',
            'Beschwörer': '👻',
            'Kleriker': '❤️',
            'Kantor': '⚜️'
        };
        const emoji = emojis[selectedClass] || '📌';

        // User zur Anmeldeliste hinzufügen oder Klasse aktualisieren
        eventData.signups.set(interaction.user.id, {
            name: interaction.user.username,
            tag: `<@${interaction.user.id}>`,
            className: selectedClass,
            emoji: emoji
        });

        // Embed Text für Anmeldungen neu generieren
        let signupText = '';
        for (const [userId, data] of eventData.signups.entries()) {
            signupText += `${data.emoji} **${data.className}**: ${data.tag}\n`;
        }
        if (signupText === '') signupText = '*Noch keine Anmeldungen*';

        // Aktualisiertes Embed erbauen
        const updatedEmbed = new EmbedBuilder()
            .setTitle(`📅 Event: ${eventData.title}`)
            .setDescription(eventData.description)
            .setColor(0x0099FF)
            .addFields(
                { name: '🕒 Datum / Uhrzeit', value: eventData.time, inline: true },
                { name: '👑 Erstellt von', value: eventData.creator, inline: true },
                { name: '👥 Aufstellung / Anmeldungen', value: signupText, inline: false }
            )
            .setFooter({ text: 'Shugo-Eventplaner v2.1 - Wähle deine Klasse unten aus.' })
            .setTimestamp();

        await interaction.update({ embeds: [updatedEmbed] });
    }

    // 3. Austragen / Absagen Button Verarbeitung
    if (interaction.isButton() && interaction.customId === 'event_decline') {
        const messageId = interaction.message.id;
        const eventData = activeEvents.get(messageId);

        if (!eventData) {
            return interaction.reply({ content: '❌ Event nicht gefunden.', ephemeral: true });
        }

        if (eventData.signups.has(interaction.user.id)) {
            eventData.signups.delete(interaction.user.id);

            let signupText = '';
            for (const [userId, data] of eventData.signups.entries()) {
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
                .setFooter({ text: 'Shugo-Eventplaner v2.1 - Wähle deine Klasse unten aus.' })
                .setTimestamp();

            await interaction.update({ embeds: [updatedEmbed] });
        } else {
            await interaction.reply({ content: 'Du stehst derzeit auf keiner Anmeldeliste für dieses Event.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
