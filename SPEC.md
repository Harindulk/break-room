# Break Room: spec

A BRB-screen game for Twitch. While the streamer is away, the BRB scene shows a wall of bricks that spells a message ("BE RIGHT BACK" by default). Every chat message launches a ball at the wall. Chatters don't learn commands: talking in chat is playing. Subs, cheers, raids and highlighted messages launch bigger or more balls. When the wall comes down, the screen shows how long chat took and who broke the most bricks, then the wall rebuilds tougher.

It runs as an OBS (or Streamlabs / Meld) Browser Source pointed at a URL. It reads chat anonymously, so the streamer needs no token, no login and no server.

## Hard constraints

- Plain HTML, CSS and JavaScript ES modules. No build step, no npm dependencies, no frameworks. Must work when served from GitHub Pages as static files, and when opened from any static file server.
- Canvas 2D rendering at a logical 1920x1080, scaled to fit the window while keeping aspect.
- Transparent page background by default so it can sit over any BRB art. `bg=1` draws a dark backdrop instead.
- Smooth at 60 fps with 300 balls on screen on a mid laptop. Fixed physics timestep.
- No audio unless `sound=1` (Browser Source audio would go out on stream). Sounds are synthesized with WebAudio, no audio files.
- No secrets, no network calls other than the Twitch chat WebSocket and Twitch emote images.
- Node's built-in test runner (`node --test`) for unit tests. No test dependencies.

## Files

- `index.html`: loads `src/main.js`. With no `channel` and no `mock`, shows the setup page instead of the game.
- `src/twitch.js`: IRC message parser (pure functions, unit-tested) and the WebSocket client.
- `src/mock.js`: fake chat for demos and judging.
- `src/game.js`: wall, balls, collisions, scoring, effects.
- `src/font.js`: a 5x7 pixel font (A-Z, 0-9, space, ! ? . , ' - : and a heart) used to lay out the wall text as bricks.
- `src/audio.js`: tiny WebAudio blips.
- `src/main.js`: reads URL params, wires chat events into the game, runs the loop.
- `test/twitch.test.js`: parser tests.

## URL parameters

| param | default | meaning |
| --- | --- | --- |
| `channel` | none | Twitch channel to read (lowercase login). |
| `mock` | 0 | `1` = fake chat, no Twitch connection. Can be combined with `channel` to test both. |
| `text` | `BE RIGHT BACK` | Wall text. Up to two lines, split with `\|` (e.g. `BRB\|5 MIN`). Uppercased; unknown characters skipped. |
| `back` | none | Minutes until the streamer returns. Shows a small "BACK IN 4:59" countdown, then "BACK ANY SECOND". |
| `rate` | 1.5 | Mock chat messages per second. |
| `bg` | 0 | `1` = dark backdrop. |
| `sound` | 0 | `1` = synthesized sound effects. |
| `ui` | 1 | `0` hides the leaderboard and status chip (clean capture). |

## Twitch chat (anonymous, read-only)

- Connect to `wss://irc-ws.chat.twitch.tv:443`. Send `CAP REQ :twitch.tv/tags twitch.tv/commands`, `PASS SCHMOOPIIE`, `NICK justinfan<random 5 digits>`, `JOIN #<channel>`.
- Answer `PING :tmi.twitch.tv` with `PONG :tmi.twitch.tv`.
- Reconnect with backoff (1s, 2s, 4s ... max 30s) on close. Honour the `RECONNECT` command.
- Parse IRCv3 tags (with `\s`, `\:`, `\\`, `\r`, `\n` escapes), prefix, command, params and trailing text. One WebSocket frame can hold several lines split by `\r\n`.
- Turn raw messages into game events:
  - `PRIVMSG` → `chat` event: `{ user, login, color, text, emotes: [{id, start, end}], badges: {subscriber, moderator, broadcaster, vip}, bits, highlighted, reward, firstMsg }`. Emote positions in the `emotes` tag are code-point indexes into the message text (not UTF-16 units); handle emoji before an emote correctly.
  - `USERNOTICE` with `msg-id` of `sub`, `resub`, `subgift`, `submysterygift`, `raid`, `announcement` → `sub`, `gift` (with count from `msg-param-mass-gift-count` when present), `raid` (with `msg-param-viewerCount`), `announcement` events.
  - `CLEARCHAT` / `CLEARMSG`: ignore.
- Missing `color` tag: derive a stable bright colour from the login.
- Mod or broadcaster commands (case-insensitive, only from `moderator` or `broadcaster` badge): `!rebuild` rebuilds the wall now, `!clear` removes all balls. All other messages, including ones starting with `!`, still launch a normal ball.

## Mock chat

- Generates believable fake chatters (procedural names such as `pixel_otter`, `NoScopeNana`, `cozy_toaster42`), each with a stable colour, some flagged as subscribers or mods.
- Messages come from a pool of short chat lines and stand-in "emotes" (draw these as coloured round faces with simple features, since real Twitch emote images need real IDs).
- Keyboard shortcuts in mock mode (also listed in a small help card at bottom-left, hidden when `ui=0`):
  - `R` raid of 40 viewers from a fake channel
  - `S` sub, `G` 5 gift subs, `B` 500-bit cheer, `H` highlighted message
  - `W` wipe the wall instantly (to show the win screen)
  - `Space` pause / resume mock chat
  - `+` / `-` change the chat rate
- A small text box (toggled with `T`) lets the presenter type a message as a chosen chatter name.

## Game rules

- The wall: each pixel of the font becomes a brick (rounded rectangle, a few pixels gap). Centred in the upper 60% of the screen, scaled to fit. Brick colours follow a vertical gradient. Level 1 bricks have 1 HP; each rebuild adds 1 HP to a growing share of bricks (level 2: 30% have 2 HP, level 3: 60%, then cap at 3 HP). Damaged bricks show cracks or a darker colour.
- A chat message launches one ball from the bottom edge. Launch x is a stable hash of the user's login across the width, so each chatter has "their" lane. Angle is random within ±30° of straight up, speed ~900 px/s.
- Balls bounce off left, right and top edges and off bricks (reflect on the axis of least penetration). A ball dies when it falls off the bottom or after 14 seconds. On each brick hit the brick loses 1 HP; the ball owner gets 1 point per brick destroyed.
- Ball looks: filled circle in the chatter's colour with a short motion trail and the display name in small text that fades after 1.5 s. If the message contains a Twitch emote, the ball is the first emote image (`https://static-cdn.jtvnw.net/emoticons/v2/<id>/default/dark/2.0`) drawn as a circle-clipped sprite, 1.5x size. Message length adds a little size (cap 1.3x).
- Specials:
  - `sub` / `resub`: 5-ball fan from the subscriber's lane, gold balls.
  - `gift`: one gold ball per gifted sub (cap 50) from the gifter's lane.
  - cheer (`bits` > 0): one heavy ball whose radius grows with bits (cap 4x); it passes through bricks instead of bouncing, until it has destroyed `10 + bits/20` bricks.
  - `raid`: a wave of `min(viewerCount, 80)` balls launched left-to-right across the bottom over 2 seconds, with a big banner "RAID! <name> + <n>".
  - highlighted message or channel-point redemption with a message: one giant ball (3x) that bounces normally.
  - `firstMsg`: normal ball with a sparkle ring and "first message!" label.
  - `announcement`: no ball; show the announcement text as a short banner.
- Win: when the last brick breaks, slow-mo for 0.6 s, big burst, then a card: "CHAT BROKE THROUGH IN 3:41", top 3 brick breakers, total balls launched. After 10 s the wall rebuilds at the next level. Mod `!rebuild` works any time.
- Leaderboard: top 5 brick breakers, top-right, compact and translucent, updating live. Status chip top-left: channel name and a dot (green connected / amber connecting / red offline / blue mock).
- Countdown (`back` param): bottom-centre, small, readable.

## Feel

Make it fun to watch: brick-break particle bursts in the brick colour, short hit-stop (30 ms) on big hits, light screen shake for raids and cheers only, squash on wall bounces, banner text that pops in with an overshoot ease. Keep it readable at 720p: thick shapes, bold type with dark outlines, nothing thinner than 3 px. Respect `prefers-reduced-motion` by turning off shake and slow-mo.

## Setup page

Shown at `index.html` with no `channel` and no `mock`. Simple centred form: channel name, wall text, minutes until back, toggles for backdrop and sound. A live preview iframe of the overlay in mock mode with those settings, a "Copy OBS URL" button, and three short setup steps (OBS: Sources → + → Browser, paste URL, width 1920, height 1080). Dark, clean, not generic: one accent colour, real hierarchy, no purple-gradient template look. A "Try the demo" button opens mock mode full screen.

## Tests

`test/twitch.test.js` covers: tag escapes, PRIVMSG with tags and emotes, emote code-point indexes after an emoji, multi-line frames, sub / gift / raid USERNOTICE mapping, PING detection, missing colour fallback is stable, mod-only command detection.
