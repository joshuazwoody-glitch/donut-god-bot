module.exports = {
  host: 'donutsmp.net',
  port: 25565,
  username: 'YOUR_BOT_ALT_USERNAME_HERE',   // ← CHANGE THIS
  version: '1.21',
  auth: 'microsoft',                         // change to 'offline' only if needed

  viewerPort: process.env.PORT || 3000,     // IMPORTANT for Render

  humanDelayMin: 80,
  humanDelayMax: 350,
  randomJitter: true,

  farm: { startX: 0, startY: 64, startZ: 0, width: 11, length: 11 }
};
