const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const pvpPlugin = require('mineflayer-pvp').plugin
const autoEat = require('mineflayer-auto-eat').plugin
const armorManager = require('mineflayer-armor-manager')
const { mineflayer: viewer } = require('prismarine-viewer')
const Vec3 = require('vec3')

const config = require('./config')
const mem = require('./modules/memory')
const ahTrader = require('./modules/ahTrader')
const pvpBrain = require('./modules/pvpBrain')
const threatDetector = require('./modules/threatDetector')
const baseManager = require('./modules/baseManager')
const architect = require('./modules/redstoneArchitect')

// ==================== CREATE BOT ====================
const bot = mineflayer.createBot({
  host: config.host,
  port: config.port,
  username: config.username,
  version: config.version,
  auth: config.auth,
  viewDistance: 'far'
})

bot.loadPlugin(pathfinder)
bot.loadPlugin(pvpPlugin)
bot.loadPlugin(autoEat)
bot.loadPlugin(armorManager)

// ==================== STATE ====================
let state = 'idle'
let inCombat = false

function setState(newState) {
  if (state !== newState) {
    console.log(`[STATE] ${state} → ${newState}`)
    state = newState
  }
}

// ==================== VIEWER (works on Render) ====================
bot.once('spawn', () => {
  console.log('✅ Bot spawned successfully!')

  // Start viewer on Render's assigned port
  try {
    viewer(bot, { 
      port: config.viewerPort, 
      firstPerson: false,
      width: 800,
      height: 600
    })
    console.log(`👁 Live viewer started on port ${config.viewerPort}`)
  } catch (e) {
    console.log('Viewer failed to start (normal on some hosts) - check console logs instead')
  }

  // Setup pathfinding
  const mcData = require('minecraft-data')(bot.version)
  const movements = new Movements(bot, mcData)
  movements.canDig = true
  movements.scafoldingBlocks = []
  bot.pathfinder.setMovements(movements)

  // Auto eat settings
  bot.autoEat.options = {
    priority: 'foodPoints',
    startAt: 14,
    bannedFood: []
  }

  // Load memory
  mem.load()

  // Start threat detection
  threatDetector.startWatching(bot, handleThreat)

  // Start main brain loop
  setTimeout(mainGodLoop, 5000)
})

// ==================== THREAT HANDLER ====================
function handleThreat(player) {
  if (inCombat) return

  const dist = bot.entity.position.distanceTo(player.position)

  if (dist < 25) {
    console.log(`[THREAT] ${player.username} is too close (${dist.toFixed(0)} blocks) - engaging PVP`)
    inCombat = true
    setState('pvp')
    pvpBrain.engageTarget(bot, player).finally(() => {
      inCombat = false
      setState('idle')
    })
  } else if (mem.data.homeBase && threatDetector.isBaseCompromised(bot, mem.data.homeBase)) {
    console.log('[THREAT] Base compromised! Relocating...')
    setState('fleeing')
    baseManager.relocate(bot).then(() => setState('idle'))
  }
}

// ==================== DEATH & DISCONNECT HANDLING ====================
bot.on('death', () => {
  console.log('[DEATH] Bot died - relocating base after respawn')
  inCombat = false
  setTimeout(() => {
    baseManager.relocate(bot).then(() => setState('idle'))
  }, 4000)
})

bot.on('end', () => {
  console.log('❌ Bot disconnected - attempting reconnect in 10s...')
  setTimeout(() => {
    process.exit(0) // Render will auto-restart the service
  }, 10000)
})

bot.on('error', (err) => {
  console.log('Error:', err.message)
})

// ==================== CHAT COMMANDS (for manual control) ====================
bot.on('chat', (username, message) => {
  if (username === bot.username) return
  const msg = message.toLowerCase()

  if (msg === '!status') {
    bot.chat(`State: ${state} | Wealth: ${mem.data.wealth} | Home: ${mem.data.homeBase ? 'Set' : 'None'}`)
  }
  if (msg === '!ah') {
    ahTrader.scanAH(bot)
  }
  if (msg === '!scan') {
    baseManager.scanForBases(bot)
  }
})

// ==================== ANTI-AFK & HUMANIZER ====================
setInterval(() => {
  if (state === 'idle' && Math.random() < 0.4) {
    const actions = ['jump', 'left', 'right', 'forward']
    const action = actions[Math.floor(Math.random() * actions.length)]
    bot.setControlState(action, true)
    setTimeout(() => bot.setControlState(action, false), 150 + Math.random() * 250)
  }
}, 45000)

// ==================== GOD DECISION LOOP (Main Brain) ====================
async function mainGodLoop() {
  console.log('🚀 God-Tier AI Loop Started - Targeting 100M+')

  while (true) {
    if (state === 'pvp' || state === 'fleeing') {
      await sleep(2000)
      continue
    }

    try {
      // Priority 1: Check for threats / base safety
      const threats = threatDetector.getNearbyPlayers(bot, 80)
      if (threats.length > 0) {
        setState('pvp')
        await sleep(1000)
        continue
      }

      // Priority 2: Trading / AH Flipping (main money maker)
      setState('trading')
      await ahTrader.scanAH(bot)
      const deals = await ahTrader.snipDeals(bot)

      if (deals.length > 0) {
        console.log(`[AH] Found ${deals.length} good deals - sniping...`)
      } else if (bot.inventory.items().length > 8) {
        // List items smartly
        const itemToSell = bot.inventory.items()[0]
        const smartPrice = ahTrader.getSmartListPrice(itemToSell.name)
        if (smartPrice) await ahTrader.sendAHCommand(bot, itemToSell, smartPrice)
      }

      // Priority 3: Architect / Build meta farm
      if (!mem.data.homeBase || Math.random() < 0.15) {
        setState('architect')
        const bestMeta = await architect.evaluateMetas(bot)
        if (!mem.data.homeBase) {
          await baseManager.findGoodBaseSpot(bot)
          await architect.buildSchematic(bot, bestMeta.schema, bot.entity.position.floored())
        }
      }

      setState('idle')

    } catch (e) {
      console.log('[LOOP ERROR]', e.message)
      setState('idle')
    }

    await sleep(8000 + Math.random() * 15000) // Human-like timing
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ==================== START ====================
console.log('Starting Donut SMP God-Tier Bot...')
