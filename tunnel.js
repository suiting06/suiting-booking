// Auto-restart tunnel for Msuiting's Ocean
// Keeps the public URL alive by reconnecting on disconnect

const lt = require("localtunnel");

async function connect() {
  while (true) {
    try {
      console.log("🔗 Connecting tunnel...");
      const subdomains = ["suiting-ocean", "msuiting-ocean", "suitings-pond"];
      let tunnel;
      for (const sub of subdomains) {
        try {
          tunnel = await lt({ port: 3000, subdomain: sub });
          break;
        } catch (e) {
          if (e.message && e.message.includes("taken")) continue;
          throw e;
        }
      }
      if (!tunnel) tunnel = await lt({ port: 3000 });
      console.log("\n🌐 PUBLIC URL: " + tunnel.url + "\n");
      console.log("   (tunnel is live — share this URL!)\n");

      // Wait for tunnel to close
      await new Promise((resolve) => {
        tunnel.on("close", () => {
          console.log("⚠️  Tunnel disconnected");
          resolve();
        });
      });
    } catch (e) {
      console.error("❌ Tunnel error:", e.message);
    }
    console.log("🔄 Reconnecting in 5 seconds...\n");
    await new Promise((r) => setTimeout(r, 5000));
  }
}

connect();
