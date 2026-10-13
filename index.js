// ==========================================
// Projekt: Discord-Shugo-Eventplaner (Version 2.0)
// Datei: index.js
// Beschreibung: DM-Wizard mit Klassenauswahl (Aion-Klassen)
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

// Initialisierung des Discord Clients
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Definition des Slash-Befehls
const commands = [
    new SlashCommandBuilder()
        .setName('event-create')
        .setDescription('Startet die schrittweise Event-Erstellung per Direktnachricht.')
];

// Event: Bot ist online
client.once('ready', async () => {
    console.log(`[Discord-Shugo-Eventplaner v2.0] Bot ist eingeloggt als ${client.user.tag}!`);
    
    try {
        await client.application.commands.set(commands);
        console.log('Slash Commands erfolgreich registriert.');
    } catch (error) {
        console.error('Fehler beim Registrieren der Slash Commands:', error);
    }
});

// Event: Interaktionen verarbeiten
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'event-create') {
        const targetChannel = interaction.channel;

        try {
            const dmChannel = await interaction.user.createDM();
            
            await interaction.reply({ 
                content: 'Ich habe dir eine Direktnachricht geschickt, um das Event zu starten!', 
                ephemeral: true 
            });

            // Schritt 1: Titel abfragen
            await dmChannel.send('📌 **Schritt 1/3:** Wie lautet der **Titel** des Events?');
            const filter = m => m.author.id === interaction.user.id;
            
            const collectedTitle = await dmChannel.awaitMessages({ filter, max: 1, time: 60000 });
            if (!collectedTitle.size) {
                return dmChannel.send('⏳ Zeitüberschreitung. Die Event-Erstellung wurde abgebrochen.');
            }
            const eventTitle = collectedTitle.first().content;

            // Schritt 2: Datum & Uhrzeit abfragen
            await dmChannel.send('🕒 **Schritt 2/3:** Wann findet das Event statt? (z.B. *Morgen um 20:00 Uhr* oder *15.10.2026 19:30*).');
            const collectedTime = await dmChannel.awaitMessages({ filter, max: 1, time: 60000 });
            if (!collectedTime.size) {
                return dmChannel.send('⏳ Zeitüberschreitung. Die Event-Erstellung wurde abgebrochen.');
            }
            const eventTime = collectedTime.first().content;

            // Schritt 3: Beschreibung abfragen
            await dmChannel.send('📝 **Schritt 3/3:** Bitte gib eine kurze **Beschreibung** oder Details zum Event ein:');
            const collectedDesc = await dmChannel.awaitMessages({ filter, max: 1, time: 120000 });
            if (!collectedDesc.size) {
                return dmChannel.send('⏳ Zeitüberschreitung. Die Event-Erstellung wurde abgebrochen.');
            }
            const eventDesc = collectedDesc.first().content;

            // Bestätigung an den Ersteller
            await dmChannel.send('✅ **Vielen Dank!** Das Event wird jetzt im Ursprungskanal veröffentlicht.');

            // Erstellen des Embeds
            const eventEmbed = new EmbedBuilder()
                .setTitle(`📅 Event: ${eventTitle}`)
                .setDescription(eventDesc)
                .setColor(0x0099FF)
                .addFields(
                    { name: '🕒 Datum / Uhrzeit', value: eventTime, inline: true },
                    { name: '👑 Erstellt von', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '👥 Aufstellung / Anmeldungen', value: '*Noch keine Anmeldungen*', inline: false }
                )
                .setFooter({ text: 'Discord-Shugo-Eventplaner v2.0 - Wähle deine Klasse unten aus.' })
                .setTimestamp();

            // Dropdown-Menü für die Klassen
            const classSelectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_class')
                .setPlaceholder('Melde dich mit deiner Klasse an...')
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Magier')
                        .setValue('class_magier')
                        .setEmoji('🔥'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Templer')
                        .setValue('class_templer')
                        .setEmoji('🛡️'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Gladiator')
                        .setValue('class_gladiator')
                        .setEmoji('⚔️'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Assasine')
                        .setValue('class_assasine')
                        .setEmoji('🗡️'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Waldläufer')
                        .setValue('class_waldlaeufer')
                        .setEmoji('🏹'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Beschwörer')
                        .setValue('class_beschwoerer')
                        .setEmoji('👻'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Kleriker')
                        .setValue('class_kleriker')
                        .setEmoji('❤️'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Kantor')
                        .setValue('class_kantor')
                        .setEmoji('⚜️')
                );

            // Abmelde-Button
            const declineButton = new ButtonBuilder()
                .setCustomId('event_decline')
                .setLabel('Absagen / Austragen')
                .setStyle(ButtonStyle.Danger);

            const rowMenu = new ActionRowBuilder().addComponents(classSelectMenu);
            const rowButton = new ActionRowBuilder().addComponents(declineButton);

            // Senden des Events in den Zielkanal mit Dropdown & Button
            await targetChannel.send({ 
                embeds: [eventEmbed], 
                components: [rowMenu, rowButton] 
            });

        } catch (error) {
            console.error('Fehler bei der Event-Erstellung per DM:', error);
            await interaction.followUp({ 
                content: '❌ Ich konnte dir keine Direktnachricht senden. Bitte überprüfe deine Privatsphäre-Einstellungen.', 
                ephemeral: true 
            }).catch(() => {});
        }
    }
});

// Login mit Token aus den Umgebungsvariablen
client.login(process.env.DISCORD_TOKEN);