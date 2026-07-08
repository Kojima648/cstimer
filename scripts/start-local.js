"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const LOCAL_DIR = path.join(ROOT_DIR, "dist", "local");
const DEFAULT_PORT = Number(getArg("--port")) || 8080;
const LANG = getArg("--lang") || "zh-cn";
const SKIP_BUILD = process.argv.includes("--skip-build");

const MIME_TYPES = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml; charset=utf-8",
	".webmanifest": "application/manifest+json; charset=utf-8"
};

function getArg(name) {
	const prefix = name + "=";
	for (const arg of process.argv.slice(2)) {
		if (arg.startsWith(prefix)) {
			return arg.slice(prefix.length);
		}
	}
}

function send(res, status, body, contentType) {
	res.writeHead(status, {
		"Content-Type": contentType || "text/plain; charset=utf-8",
		"Cache-Control": "no-store"
	});
	res.end(body);
}

function serveFile(reqPath, res) {
	const relativePath = decodeURIComponent(reqPath === "/" ? "/index.html" : reqPath).replace(/^\/+/, "");
	const filePath = path.resolve(LOCAL_DIR, relativePath);
	if (!filePath.startsWith(LOCAL_DIR + path.sep) && filePath !== LOCAL_DIR) {
		send(res, 403, "Forbidden");
		return;
	}
	fs.readFile(filePath, (err, data) => {
		if (err) {
			send(res, 404, "Not found");
			return;
		}
		send(res, 200, data, MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream");
	});
}

function build() {
	if (SKIP_BUILD) {
		return;
	}
	const result = spawnSync(process.execPath, [path.join(__dirname, "build-local.js"), `--lang=${LANG}`], {
		cwd: ROOT_DIR,
		stdio: "inherit"
	});
	if (result.status !== 0) {
		process.exit(result.status || 1);
	}
}

function listen(port) {
	const server = http.createServer((req, res) => serveFile(new URL(req.url, "http://localhost").pathname, res));
	server.once("error", (err) => {
		if (err.code === "EADDRINUSE" && port < DEFAULT_PORT + 20) {
			listen(port + 1);
			return;
		}
		throw err;
	});
	server.listen(port, "127.0.0.1", () => {
		console.log(`csTimer local: http://localhost:${port}/`);
	});
}

build();
listen(DEFAULT_PORT);
