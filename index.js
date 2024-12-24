/*************************************************************************
 * index.js
 * Auggie Bot - Without Chess Puzzles
 *
 * Features:
 *  - Daily "gm" message at 11:00 AM UTC
 *  - Weekly challenge generation with OpenAI
 *  - Slash commands for help, guide, challenge, note-taking
 *  - "!ask" for Q&A with GPT-3.5-turbo
 *************************************************************************/

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  SlashCommandBuilder
} = require('discord.js');
const fetch = require('node-fetch'); // node-fetch@2
const cron = require('node-cron');

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Global data
let currentChallenge = null; // Store the latest weekly challenge text
let userNotes = {};          // { userId: [ "note1", "note2", ... ] }

// ──────────────────────────────────────────────────────────────────────────
// 1) DAILY "gm" MESSAGE
// ──────────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Schedule a daily "gm" message at 11:00 AM UTC in #gm channel
  const gmChannel = client.channels.cache.find(ch => ch.name.toLowerCase() === 'gm' && ch.isTextBased());
  if (!gmChannel) {
    console.log("gm channel not found. Please create one named #gm.");
  } else {
    cron.schedule('0 11 * * *', () => {
      gmChannel.send('gm');
    });
  }

  // Register slash commands once the client is ready
  await registerSlashCommands();

  console.log("Auggie is ready and slash commands have been registered.");
});

// ──────────────────────────────────────────────────────────────────────────
// 2) WELCOME NEW MEMBERS
// ──────────────────────────────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  const arrivalsChannel = member.guild.channels.cache.find(
    ch => ch.name.toLowerCase() === 'arrivals' && ch.isTextBased()
  );

  if (!arrivalsChannel) {
    console.log("Arrivals channel not found. Please create one named #arrivals.");
    return;
  }

  const welcomeMessage = `**HELLO, <@${member.id}>!** Welcome to BuildToLearn.ai!\nType **!guide** to get a quick overview of what we do here. We’re excited to have you here!`;
  arrivalsChannel.send(welcomeMessage);
});

// ──────────────────────────────────────────────────────────────────────────
// 3) WEEKLY CHALLENGE LOGIC (OpenAI)
// ──────────────────────────────────────────────────────────────────────────
async function generateWeeklyChallenge() {
  const messages = [
    {
      role: "system",
      content: "You are Auggie the BuilderBot. Generate one fun, beginner-friendly building challenge. Focus on something people can easily do with AI tools or small coding tasks, and make it shareable. Give it a short, catchy title and then describe it in a few sentences. Encourage them to share their results."
    }
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages,
        max_tokens: 300,
        temperature: 0.8
      })
    });
    
    if (!response.ok) {
      console.error('OpenAI API response not OK:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content;
    return answer ? `**Weekly Challenge:**\n${answer}` : null;
  } catch (error) {
    console.error('Error generating challenge:', error);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 4) HELP & GUIDE
// ──────────────────────────────────────────────────────────────────────────
function getHelpMessage() {
  return (
    "**Auggie Help Menu**\n\n" +
    "Use these **slash commands** to interact with Auggie:\n\n" +
    "**/challenge** - Generate a weekly beginner-friendly building challenge.\n" +
    "**/currentchallenge** - Show the last generated weekly challenge.\n" +
    "**/addnote [text]** - Add a personal note.\n" +
    "**/mynotes** - View all your notes.\n" +
    "**/clearnotes** - Clear all your notes.\n" +
    "**/guide** - Get a quick overview of what we do here.\n\n" +
    "And remember: **!ask [question]** - to ask Auggie something in a more conversational way!"
  );
}

function getGuideMessage() {
  return (
    "Welcome to BuildToLearn.ai! This is a space where you can learn by creating, " +
    "experimenting, and sharing your progress. Whether you’re just hanging out, following along, " +
    "or ready to jump in and participate, we’re glad to have you.\n\n" +
    "**Channels Overview:**\n" +
    "- **#start-here**: Intro and basics.\n" +
    "- **#introductions**: Say hi if you like.\n" +
    "- **#links-resources-learning**: Helpful materials.\n" +
    "- **#wip**: Work-in-progress.\n" +
    "- **#feedback**: Get input.\n" +
    "- **#share**: Show finished projects.\n" +
    "- **#build-history**: Track ongoing builds.\n" +
    "- **#challenge**: Weekly building challenges.\n" +
    "- **#showcase**: Highlight notable projects.\n\n" +
    "Feel free to explore and build at your own pace."
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 5) SLASH COMMAND REGISTRATION
// ──────────────────────────────────────────────────────────────────────────
async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Displays Auggie’s help menu'),

    new SlashCommandBuilder()
      .setName('guide')
      .setDescription('Get a quick overview of what BuildToLearn.ai does'),

    new SlashCommandBuilder()
      .setName('challenge')
      .setDescription('Generate a weekly beginner-friendly building challenge'),

    new SlashCommandBuilder()
      .setName('currentchallenge')
      .setDescription('Show the last generated weekly challenge'),

    new SlashCommandBuilder()
      .setName('addnote')
      .setDescription('Add a personal note')
      .addStringOption(option => 
        option
          .setName('text')
          .setDescription('Your note text')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('mynotes')
      .setDescription('View all your notes'),

    new SlashCommandBuilder()
      .setName('clearnotes')
      .setDescription('Clear all your notes'),
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  try {
    console.log('Refreshing (/) commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('Successfully reloaded (/) commands!');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 6) INTERACTION HANDLER (Slash Commands)
// ──────────────────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  switch (commandName) {
    case 'help': {
      await interaction.reply(getHelpMessage());
      break;
    }
    case 'guide': {
      await interaction.reply(getGuideMessage());
      break;
    }
    case 'challenge': {
      const challenge = await generateWeeklyChallenge();
      if (challenge) {
        currentChallenge = challenge;
        await interaction.reply(challenge);
      } else {
        await interaction.reply("Sorry, I couldn’t generate a challenge right now. Try again later.");
      }
      break;
    }
    case 'currentchallenge': {
      if (currentChallenge) {
        await interaction.reply(currentChallenge);
      } else {
        await interaction.reply("No current challenge has been set yet. Try `/challenge` to generate one!");
      }
      break;
    }
    case 'addnote': {
      const note = interaction.options.getString('text');
      if (!note) {
        await interaction.reply("Please provide a note using /addnote text: your_note_here");
        return;
      }
      const userId = interaction.user.id;
      if (!userNotes[userId]) userNotes[userId] = [];
      userNotes[userId].push(note);
      await interaction.reply("Note added!");
      break;
    }
    case 'mynotes': {
      const userId = interaction.user.id;
      const notes = userNotes[userId];
      if (!notes || notes.length === 0) {
        await interaction.reply("You have no notes yet. Use `/addnote` to add some.");
        return;
      }
      let response = "**Your Notes:**\n";
      notes.forEach((n, i) => {
        response += `${i+1}. ${n}\n`;
      });
      await interaction.reply(response);
      break;
    }
    case 'clearnotes': {
      const userId = interaction.user.id;
      userNotes[userId] = [];
      await interaction.reply("All your notes have been cleared.");
      break;
    }
    default:
      await interaction.reply("Unknown command.");
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 7) MESSAGE HANDLER (Keep "!ask" for Conversation Q&A)
// ──────────────────────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const lowerContent = content.toLowerCase();

  // Keep the !ask logic
  if (!lowerContent.startsWith('!ask')) return;

  const userQuestion = content.replace('!ask', '').trim();
  if (!userQuestion) {
    return message.reply('Ask me something after `!ask`!');
  }

  try {
    // Fetch recent messages for context
    const fetched = await message.channel.messages.fetch({ limit: 20 });
    const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const recentMessages = sorted.map(m => {
      if (m.author.id === client.user.id) {
        return { role: "assistant", content: m.content };
      } else {
        return { role: "user", content: m.content };
      }
    });

    // Build an OpenAI prompt with the recent conversation
    const promptMessages = [
      {
        role: "system",
        content: "You are Auggie the BuilderBot, a friendly AI who encourages learning through building small projects. Keep responses supportive, approachable, positive, and calm. Use the recent messages as context. Avoid overly enthusiastic language or repeated slogans."
      },
      ...recentMessages,
      { role: "user", content: userQuestion }
    ];

    // Call OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: promptMessages,
        max_tokens: 200,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      console.error('OpenAI API response not OK:', response.status, await response.text());
      return message.reply("Sorry, I'm having trouble connecting to the AI right now.");
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content;

    if (answer) {
      message.reply(answer);
    } else {
      message.reply("Hmm, I didn’t find an answer. Try again?");
    }
  } catch (error) {
    console.error('Error:', error);
    message.reply("I ran into an error. Try again in a moment?");
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 8) BOT LOGIN
// ──────────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_BOT_TOKEN);
