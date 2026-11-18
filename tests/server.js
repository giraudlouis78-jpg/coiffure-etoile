// Serveur de test : sert ./site et expose Code.gs (objets Google simulés) sur /api.
// TZ=Europe/Paris node tests/server.js [port] [date-iso]
const http = require("http"), fs = require("fs"), path = require("path");
const { load } = require("./gas-mocks");

function start(port = 8765, now) {
  const g = load({ now });
  const root = path.join(__dirname, "..", "site");
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain", ".png": "image/png" };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/api") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const out = req.method === "POST"
          ? g.run(`doPost(${JSON.stringify({ postData: { contents: body } })})`)
          : g.run(`doGet(${JSON.stringify({ parameter: Object.fromEntries(u.searchParams) })})`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(out.content);
      });
      return;
    }
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith("/")) f = path.join(f, "index.html");
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404, { "Content-Type": types[".html"] }); return res.end(fs.readFileSync(path.join(root, "404.html"))); }
    res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
    res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(port, () => r({ srv, g })));
}
module.exports = { start };
if (require.main === module) start(+process.argv[2] || 8765, process.argv[3]).then(() => console.log("http://localhost:" + (+process.argv[2] || 8765)));
