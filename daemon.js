// Auto-restarting server + tunnel daemon
const { spawn } = require("child_process");
const path = require("path");

const PROJECT_DIR = path.join(__dirname);

function startServer() {
  return spawn("node", ["server.js"], {
    cwd: PROJECT_DIR,
    stdio: "inherit",
    env: { ...process.env, HTTP_PROXY: "", HTTPS_PROXY: "", http_proxy: "", https_proxy: "" },
  });
}

function startTunnel() {
  return spawn(process.execPath, [
    "-e",
    `
    const lt = require('localtunnel');
    (async () => {
      while (true) {
        try {
          const tunnel = await lt({ port: 3000, subdomain: 'msuiting-ocean' });
          console.log('\\n🌐 PUBLIC URL: ' + tunnel.url + '\\n');
          tunnel.on('close', () => {
            console.log('⚠️  Tunnel dropped, reconnecting in 5s...');
          });
          await new Promise((resolve) => tunnel.on('close', resolve));
        } catch (e) {
          console.error('Tunnel error:', e.message, '- retrying in 5s...');
        }
        await new Promise(r => setTimeout(r, 5000));
      }
    })();
    `,
  ], {
    cwd: path.join(require.resolve("localtunnel"), "../../.."),
    stdio: "inherit",
    env: {
      ...process.env,
      HTTP_PROXY: "", HTTPS_PROXY: "", http_proxy: "", https_proxy: "",
      NODE_PATH: path.join(require.resolve("localtunnel"), "../../..") + "/node_modules",
    },
  });
}

console.log("🐟 Starting Msuiting's Ocean...\n");

const server = startServer();
setTimeout(() => {
  const tunnel = startTunnel();
  tunnel.on("exit", (code) => {
    console.log(`Tunnel exited (code ${code}), restarting...`);
    startTunnel();
  });
}, 2000);

server.on("exit", (code) => {
  console.log(`Server exited (code ${code}), restarting...`);
  startServer();
});

process.on("SIGINT", () => {
  console.log("\n👋 Shutting down Msuiting's Ocean...");
  server.kill();
  process.exit(0);
});
