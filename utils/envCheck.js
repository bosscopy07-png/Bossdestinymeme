export function envCheck() {
  const required = [
    "TELEGRAM_BOT_TOKEN",
    "BSC_RPC",
    "CHAIN_ID",
    "PORT",
    "ADMIN_CHAT_ID",
    "ALLOWED_USERS"
  ];

  const missing = required.filter(
    key => !process.env[key] || process.env[key].trim() === ""
  );

  if (missing.length) {
    console.error("❌ Missing required environment variables:");
    missing.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }

  // ---- Boolean sanity checks ----
  const boolVars = [
    "LIVE_MODE",
    "PAPER_MODE",
    "SCAN_NEW_PAIRS",
    "SCAN_MEMPOOL",
    "SCAN_GECKO_TRENDING"
  ];

  boolVars.forEach(key => {
    if (process.env[key] && !["true", "false"].includes(process.env[key])) {
      console.error(`❌ ${key} must be "true" or "false"`);
      process.exit(1);
    }
  });

  // ---- Mode conflict protection ----
  if (
    process.env.LIVE_MODE === "true" &&
    process.env.PAPER_MODE === "true"
  ) {
    console.error("❌ LIVE_MODE and PAPER_MODE cannot both be true");
    process.exit(1);
  }

  // ---- Numeric validation ----
  const numberVars = [
    "PORT",
    "CHAIN_ID",
    "MIN_LIQUIDITY",
    "MIN_HOLDERS",
    "MAX_GAS_GWEI",
    "PAIR_SCAN_INTERVAL",
    "MEMPOOL_SCAN_INTERVAL"
  ];

  numberVars.forEach(key => {
    if (process.env[key] && isNaN(Number(process.env[key]))) {
      console.error(`❌ ${key} must be a number`);
      process.exit(1);
    }
  });

  // ---- Production safety warnings ----
  if (process.env.NODE_ENV === "production") {
    if (process.env.TRADING_DISABLED !== "true" &&
        process.env.PAPER_MODE !== "true") {
      console.warn("⚠️  WARNING: Trading is ENABLED in production");
    }
  }

  console.log("✅ Environment variables validated successfully");
                         }
