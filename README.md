# The Anvil

A local tool for organizing Skyrim follower projects, exploring quest dialogue, editing Papyrus scripts, and authoring simple voiced Idle dialogue. Built with React, TypeScript, Vite, Fastify, and SQLite.

## Getting started

Requires Node.js 24+ and an installed Skyrim Special Edition data directory. From the project directory:

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:5173. Run `npm test` and `npm run build` to verify the project. The server listens only on `127.0.0.1`.

Set `FOLLOWER_SKYRIM_DATA` to override the Skyrim Data directory, `FOLLOWER_DB` to choose the SQLite database, or `FOLLOWER_PORT` and `FOLLOWER_WEB_PORT` to change the local ports. The database, generated files, backups, API credentials, and build output are not included in Git.

## Projects and dialogue

Create a project by choosing an existing ESP or ESM. The importer records the plugin's own quests and stages. Use Quest Setup to organize quests by Skyrim quest group, mod quest group, or character. The Skyrim quest catalog is a snapshot; it is not a live catalog of all game content.

The quest browsers display stages, objectives, dialogue, and available WAV recordings. Stage matching uses direct quest conditions; other conditions may also affect whether a line can play. Voice labels are inferred from the voice type when possible and do not always identify a unique speaker.

**Sync Mod** reads the saved plugin and refreshes the dialogue view. It reports added, updated, and removed dialogue after a baseline has been established. The comparison covers imported quests and dialogue text, type, conditions, speaker, and emotion; it does not cover audio files or all other plugin records. The first sync establishes a baseline. Progress analysis is cached and updated for affected quests when possible.

## Authoring an Idle

Use **Add Idle** on a stage to enter a line, select a speaker, set emotion and conditions, and prepare the audio. The destination quest must have exactly one existing Idle topic. Choose the speaker's matching voice folder, then load a mono 16-bit PCM WAV or generate a voice with ElevenLabs and generate its LIP. Saving requires both WAV and LIP, creates a plugin backup, and writes the INFO and voice files. The Creation Kit must be closed during this operation. Review newly created dialogue in the Creation Kit before using it in game.

Lipsync generation uses FaceFXWrapper and FonixData. Set `FOLLOWER_FACEFX_DIR` to a directory containing `FaceFXWrapper.exe` and `FonixData.cdf`. The local development fallback points to the adjacent Bjorn Thinking Quest Studio installation; those tools are not included in this repository.

## ElevenLabs and AI assistant

In Settings, save an ElevenLabs API key, load available voices, and associate a voice with a character before generating audio. The key is protected with Windows DPAPI and stored locally. Audio generation sends the dialogue text to ElevenLabs and may use account credits.

The assistant supports OpenAI, OpenRouter, Anthropic, Google Gemini, and compatible custom HTTPS endpoints. The selected provider receives the conversation and enabled project context. API keys are protected with Windows DPAPI; assistant conversations remain in the current page session.

## Scripts

Scripts attached to plugin-owned records can be viewed and edited when their Papyrus source is available in the active Skyrim `Data/Source/Scripts` directory. The script workflow validates changes, creates backups, and compiles through the configured Creation Kit tools. Fragment-only references and other indirect dependencies may not be listed.
