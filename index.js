require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch'); // node-fetch@2
const cron = require('node-cron');
const ChessImageGenerator = require('chess-image-generator');
const { Chess } = require('chess.js'); // Import chess.js

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Feature flag for Chess Puzzles
const ENABLE_CHESS_PUZZLES = true;

const chessImageGenerator = new ChessImageGenerator();

let puzzles = {
  current: null,
  previous: null
};
let points = {}; // { userId: score }
let currentChallenge = null; // Store the latest weekly challenge text
let userNotes = {}; // { userId: [ "note1", "note2", ... ] }

// Prompts for random daily open-ended question
const prompts = [
  "What’s everyone building today?",
  "Any fun AI experiments going on?",
  "Tried something new recently? Share your progress!",
  "What’s on your mind tech-wise?",
  "Any cool tools or resources discovered lately?"
];

function scheduleRandomPromptForToday() {
  // Choose a random hour between 9 and 15 (9am to 3pm)
  const hour = Math.floor(Math.random() * 7) + 9; 
  const minute = Math.floor(Math.random() * 60);
  const cronExpression = `0 ${minute} ${hour} * * *`;
  
  const job = cron.schedule(cronExpression, () => {
    postRandomPrompt();
    job.stop(); // Stop this one-off job
  });
}

function postRandomPrompt() {
  const generalChannel = client.channels.cache.find(ch => ch.name.toLowerCase() === 'general' && ch.isTextBased());
  if (!generalChannel) {
    console.log("General channel not found. Please create one named #general.");
    return;
  }
  const prompt = prompts[Math.floor(Math.random() * prompts.length)];
  generalChannel.send(prompt);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const gmChannel = client.channels.cache.find(ch => ch.name.toLowerCase() === 'gm' && ch.isTextBased());
  if (!gmChannel) {
    console.log("gm channel not found. Please create one named #gm.");
  } else {
    // Schedule a daily "gm" message at 11:00 AM UTC
    cron.schedule('0 11 * * *', () => {
      gmChannel.send('gm');
    });
  }

  // Schedule the random prompt for today
  // Every midnight, we reset and choose a new random time
  cron.schedule('0 0 * * *', () => {
    scheduleRandomPromptForToday();
  });
  // Also run it once on startup to schedule for today
  scheduleRandomPromptForToday();
});

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

// Only define puzzle-related functions if ENABLE_CHESS_PUZZLES is true
let fetchChessPuzzle, generateChessBoard, postDailyPuzzle;
if (ENABLE_CHESS_PUZZLES) {
  // Generate a weekly challenge
  async function generateWeeklyChallenge() {
    const messages = [
      {
        role: "system",
        content: "You are Auggie the BuilderBot. Generate one fun, beginner-friendly building challenge. Focus on something people can easily do with AI tools or small coding tasks, and make it shareable. Give it a short, catchy title and then describe it in a few sentences. Encourage them to share their results."
      }
    ];

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
  }

  fetchChessPuzzle = async function() {
    try {
      const response = await fetch('https://lichess.org/api/puzzle/daily');
      if (!response.ok) throw new Error('Failed to fetch the puzzle.');
      const puzzleData = await response.json();

      console.log('Fetched puzzle data:', puzzleData);

      const puzzle = puzzleData.puzzle;
      const game = puzzleData.game;
      const { initialPly, solution } = puzzle;
      const pgn = game.pgn;

      const fullGame = new Chess();
      fullGame.loadPgn(pgn);

      const history = fullGame.history({ verbose: true });

      const partialChess = new Chess();
      for (let i = 0; i < initialPly - 1; i++) {
        partialChess.move(history[i]);
      }

      const fen = partialChess.fen();
      const currentTurn = partialChess.turn();
      const sideToMove = currentTurn === 'w' ? 'White' : 'Black';

      return {
        id: game.id,
        fen: fen,
        moves: solution,
        link: `https://lichess.org/training/${game.id}`,
        startTime: new Date(),
        sideToMove: sideToMove
      };
    } catch (error) {
      console.error('Error fetching puzzle:', error);
      return null;
    }
  };

  generateChessBoard = async function(fen) {
    try {
      if (!fen) {
        console.error('No fen provided to generateChessBoard.');
        return null;
      }
      chessImageGenerator.loadFEN(fen.trim());
      const filePath = `./chessboard.png`;
      await chessImageGenerator.generatePNG(filePath);
      return filePath;
    } catch (error) {
      console.error('Error generating chess board image:', error);
      return null;
    }
  };

  postDailyPuzzle = async function() {
    const puzzlesChannel = client.channels.cache.find(ch => ch.name.toLowerCase() === 'chess-puzzles' && ch.isTextBased());
    if (!puzzlesChannel) {
      console.error('Chess puzzles channel not found.');
      return;
    }

    // Reveal the previous puzzle's solution if exists
    if (puzzles.previous) {
      puzzlesChannel.send(
        `**Solution to Yesterday's Puzzle**\nMoves: ${puzzles.previous.moves.join(' ')}\n[Replay it on Lichess](${puzzles.previous.link})`
      );
    }

    puzzles.previous = puzzles.current;
    puzzles.current = await fetchChessPuzzle();

    if (puzzles.current) {
      const boardImage = await generateChessBoard(puzzles.current.fen);
      if (boardImage) {
        await puzzlesChannel.send({
          content: `**Daily Chess Puzzle** (It's ${puzzles.current.sideToMove}'s move)\n[Try it on Lichess](${puzzles.current.link})`,
          files: [boardImage]
        });
      } else {
        puzzlesChannel.send(
          `**Daily Chess Puzzle** (It's ${puzzles.current.sideToMove}'s move)\nFEN: ${puzzles.current.fen}\n[Try it on Lichess](${puzzles.current.link})`
        );
      }
    } else {
      puzzlesChannel.send('Failed to fetch today’s puzzle. Please try again later.');
    }
  };

  // Schedule daily puzzle posting at 12:00 PM UTC
  cron.schedule('0 12 * * *', postDailyPuzzle);

  // We'll reuse generateWeeklyChallenge in a command below
} else {
  // If puzzles are disabled, define a stub for generateWeeklyChallenge()
  async function generateWeeklyChallenge() {
    // Return a simple message or null
    return "**Weekly Challenge:**\nTry building a tiny web page that displays a random quote!";
  }
}


// Update points after solving a puzzle (still needed if puzzles are enabled)
function awardPoints(userId, awardedPoints) {
  points[userId] = (points[userId] || 0) + awardedPoints;
}

// Display the top 5 scorers
function getLeaderboardMessage() {
  const entries = Object.entries(points);
  if (entries.length === 0) {
    return "No scores yet! Solve a puzzle to earn points.";
  }

  // Sort by score descending
  entries.sort((a, b) => b[1] - a[1]);

  const topFive = entries.slice(0, 5);
  let msg = "**Leaderboard**\n";
  topFive.forEach(([userId, score], idx) => {
    msg += `${idx + 1}. <@${userId}> - ${score} points\n`;
  });
  return msg;
}

function getHelpMessage() {
  return (
    "**Auggie Help Menu**\n\n" +
    "**!ask [question]** - Ask Auggie a question related to building, AI, or the server.\n" +
    "**!challenge** - Generate a weekly beginner-friendly building challenge.\n" +
    "**!currentchallenge** - Show the last generated weekly challenge.\n" +
    (ENABLE_CHESS_PUZZLES ? "**!testpuzzle** - Fetch a test chess puzzle.\n**/answer [moves]** - Submit solution for current puzzle.\n" : "") +
    "**!leaderboard** - Show the top puzzle solvers (if puzzles are enabled).\n" +
    "**!addnote [text]** - Add a personal note.\n" +
    "**!mynotes** - View all your notes.\n" +
    "**!clearnotes** - Clear all your notes.\n" +
    "**!help** - Show this help menu.\n" +
    "**!guide** - Get a quick overview of what we do here."
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
    "- **#showcase**: Highlight notable projects.\n" +
    (ENABLE_CHESS_PUZZLES ? "- **#chess-puzzles**: Daily puzzles for fun.\n\n" : "\n") +
    "Feel free to explore and build at your own pace."
  );
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const lowerContent = content.toLowerCase();

  // Note-taking commands
  if (lowerContent.startsWith('!addnote')) {
    const note = content.replace('!addnote', '').trim();
    if (!note) {
      return message.reply("Please specify a note: `!addnote your note here`");
    }
    const userId = message.author.id;
    if (!userNotes[userId]) userNotes[userId] = [];
    userNotes[userId].push(note);
    return message.reply("Note added!");
  }

  if (lowerContent === '!mynotes') {
    const userId = message.author.id;
    const notes = userNotes[userId];
    if (!notes || notes.length === 0) {
      return message.reply("You have no notes yet. Use `!addnote` to add some.");
    }
    let response = "**Your Notes:**\n";
    notes.forEach((n, i) => {
      response += `${i+1}. ${n}\n`;
    });
    return message.channel.send(response);
  }

  if (lowerContent === '!clearnotes') {
    const userId = message.author.id;
    userNotes[userId] = [];
    return message.reply("All your notes have been cleared.");
  }

  if (lowerContent === '!help') {
    return message.channel.send(getHelpMessage());
  }

  if (lowerContent === '!guide') {
    return message.channel.send(getGuideMessage());
  }

  if (lowerContent === '!challenge') {
    const challenge = await generateWeeklyChallenge();
    if (challenge) {
      currentChallenge = challenge;
      message.channel.send(challenge);
    } else {
      message.channel.send("Sorry, I couldn’t generate a challenge right now. Try again later.");
    }
    return;
  }

  if (lowerContent === '!currentchallenge') {
    if (currentChallenge) {
      message.channel.send(currentChallenge);
    } else {
      message.channel.send("No current challenge has been set yet. Try `!challenge` to generate one!");
    }
    return;
  }

  if (ENABLE_CHESS_PUZZLES && lowerContent === '!testpuzzle') {
    const testPuzzle = await fetchChessPuzzle();
    if (testPuzzle) {
      const boardImage = await generateChessBoard(testPuzzle.fen);
      if (boardImage) {
        await message.channel.send({
          content: `**Test Chess Puzzle** (It's ${testPuzzle.sideToMove}'s move)\n[Play it on Lichess](${testPuzzle.link})`,
          files: [boardImage]
        });
      } else {
        message.channel.send(
          `**Test Chess Puzzle** (It's ${testPuzzle.sideToMove}'s move)\nFEN: ${testPuzzle.fen}\n[Play it on Lichess](${testPuzzle.link})`
        );
      }
    } else {
      message.channel.send('Failed to fetch a test puzzle. Please try again later.');
    }
    return;
  }

  if (lowerContent === '!leaderboard') {
    return message.channel.send(getLeaderboardMessage());
  }

  // Handle !ask command
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

    const promptMessages = [
      {
        role: "system",
        content: "You are Auggie the BuilderBot, a friendly AI who encourages learning through building small projects. You appreciate creativity and curiosity, but you don’t need to repeat motivational catchphrases or slogans. When you respond, be supportive, but keep your language natural and not overly enthusiastic. O occassion you can offer thoughtful suggestions, small compliments, or gentle encouragement but keep it subdued. Keep responses positive, practical, and calm—avoid constant exclamation marks or cheerleading. Below are recent messages from this Discord channel. Treat them as a conversation history you can recall and reference. Just be a helpful, approachable presence."
      },
      ...recentMessages,
      { role: "user", content: userQuestion }
    ];

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

client.login(process.env.DISCORD_BOT_TOKEN);
