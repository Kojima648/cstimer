"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const LOCAL_DIR = path.join(DIST_DIR, "local");
const LANG_DIR = path.join(SRC_DIR, "lang");
const DIST_LANG_DIR = path.join(DIST_DIR, "lang");
const MAKEFILE = path.join(ROOT_DIR, "Makefile");
const COMPILER = path.join(ROOT_DIR, "lib", "compiler.jar");
const LANG = getArg("--lang") || "zh-cn";
const UPDATE_CACHE = process.argv.includes("--update-cache");

const SUPPORTED_LANGS = [
	"en-us", "ar-sa", "bn-bd", "ca-es", "cs-cz", "da-dk", "de-de", "el-gr",
	"es-es", "fa-ir", "fi-fi", "fr-fr", "he-il", "hi-in", "hr-hr", "hu-hu",
	"it-it", "ja-jp", "ko-kr", "lv-lv", "nl-nl", "no-no", "pl-pl", "pt-pt",
	"ro-ro", "ru-ru", "sk-sk", "sl-si", "sr-sp", "sv-se", "tr-tr", "uk-ua",
	"vi-vn", "zh-cn", "zh-tw"
];

function getArg(name) {
	const prefix = name + "=";
	for (const arg of process.argv.slice(2)) {
		if (arg.startsWith(prefix)) {
			return arg.slice(prefix.length);
		}
	}
}

function mkdirp(dir) {
	fs.mkdirSync(dir, { recursive: true });
}

function readUtf8(filePath) {
	return fs.readFileSync(filePath, "utf8");
}

function writeUtf8(filePath, value) {
	mkdirp(path.dirname(filePath));
	fs.writeFileSync(filePath, value, "utf8");
}

function copyFile(src, dest) {
	mkdirp(path.dirname(dest));
	fs.copyFileSync(src, dest);
}

function copyDirFiles(srcDir, destDir, filter) {
	mkdirp(destDir);
	for (const name of fs.readdirSync(srcDir)) {
		const src = path.join(srcDir, name);
		if (!fs.statSync(src).isFile() || filter && !filter(name)) {
			continue;
		}
		copyFile(src, path.join(destDir, name));
	}
}

function run(command, args) {
	const shown = [command].concat(args).map((arg) => /\s/.test(arg) ? `"${arg}"` : arg).join(" ");
	console.log(shown);
	const result = spawnSync(command, args, { cwd: ROOT_DIR, stdio: "inherit" });
	if (result.status !== 0) {
		process.exit(result.status || 1);
	}
}

function parseMakeJsList(varName) {
	const lines = readUtf8(MAKEFILE).split(/\r?\n/);
	const start = lines.findIndex((line) => line.startsWith(`${varName} = $(addprefix $(src)/js/,`));
	if (start === -1) {
		throw new Error(`Cannot find ${varName} in Makefile`);
	}
	const files = [];
	for (let i = start + 1; i < lines.length; i++) {
		let line = lines[i].trim();
		const end = line.endsWith(")");
		line = line.replace(/\\$/, "").replace(/\)$/, "").trim();
		if (line) {
			files.push(path.join(SRC_DIR, "js", line));
		}
		if (end) {
			break;
		}
	}
	return files;
}

function compile(outputFile, inputFiles, extraArgs) {
	const args = [
		"-jar", COMPILER,
		"--use_types_for_optimization",
		"--language_out", "STABLE",
		"--charset", "UTF-8",
		"--strict_mode_input"
	].concat(extraArgs || [], inputFiles, ["--js_output_file", outputFile]);
	run("java", args);
}

function getVersion() {
	const result = spawnSync("git", ["describe", "--tags", "--always"], {
		cwd: ROOT_DIR,
		encoding: "utf8"
	});
	if (result.status === 0 && result.stdout.trim()) {
		return result.stdout.trim();
	}
	return "Unspecified";
}

function escapeJsString(value) {
	return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function renderLangDet(lang, version) {
	const langDet = readUtf8(path.join(DIST_LANG_DIR, "langDet.php"));
	const langSet = (langDet.match(/var\s+LANG_SET\s*=\s*'([^']*)';/) || [])[1] || "";
	const langStr = (langDet.match(/var\s+LANG_STR\s*=\s*'([^']*)';/) || [])[1] || "";
	const langJs = readUtf8(path.join(DIST_LANG_DIR, `${lang}.js`));
	return [
		'  <meta name="keywords" content="timer, cstimer, rubiks cube timer, online timer, web timer">',
		"  <title> csTimer - Local Development </title>",
		'  <script type="text/javascript">',
		`var CSTIMER_VERSION = '${escapeJsString(version)}';`,
		`var LANG_SET = '${langSet}';`,
		`var LANG_STR = '${langStr}';`,
		`var LANG_CUR = '${escapeJsString(lang)}';`,
		langJs,
		"  </script>"
	].join("\n");
}

function renderAbout(lang, version) {
	let html = readUtf8(path.join(DIST_LANG_DIR, `${lang}.php`));
	html = html.replace(/<\?php\s+echo\s+\$version;\s*\?>/g, version);
	html = html.replace(/<\?php\s+include\('lang\.php'\);?\s*\?>/g, readUtf8(path.join(DIST_LANG_DIR, "lang.php")));
	html = html.replace(/<\?php\s+include\('color\.php'\);?\s*\?>/g, readUtf8(path.join(DIST_LANG_DIR, "color.php")));
	return html.replace(/<\?php[\s\S]*?\?>/g, "");
}

function renderLocalIndex(lang, version) {
	let html = readUtf8(path.join(DIST_DIR, "timer.php"));
	html = html.replace(/<html manifest="cache\.manifest">/g, '<html class="p100">');
	html = html.replace(/<\?php[\s\S]*?\?>\s*/, "");
	html = html.replace(/<\?php\s+include\('lang\/langDet\.php'\);\s*\?>/g, renderLangDet(lang, version));
	html = html.replace(/<\?php\s+include\('baidutongji\.php'\)\s*\?>/g, "");
	html = html.replace(/<\?php\s+include\('lang\/'\.\$lang\.'\.php'\)\s*\?>/g, renderAbout(lang, version));
	return html;
}

function updateVersion(version) {
	const filePath = path.join(DIST_LANG_DIR, "langDet.php");
	const next = readUtf8(filePath).replace(/\$version = "[^"]*"/, `$version = "${version}"`);
	writeUtf8(filePath, next);
}

function md5Files(files) {
	const hash = crypto.createHash("md5");
	for (const file of files) {
		if (fs.existsSync(file)) {
			hash.update(fs.readFileSync(file));
		}
	}
	return hash.digest("hex");
}

function updateCacheFiles(hash) {
	const manifestPath = path.join(DIST_DIR, "cache.manifest");
	let manifest = fs.existsSync(manifestPath) ? readUtf8(manifestPath) : "CACHE MANIFEST\n";
	manifest = manifest.replace(/\r?\n# MD5=.*$/m, "").trimEnd() + `\n# MD5=${hash}\n`;
	writeUtf8(manifestPath, manifest);

	const swPath = path.join(DIST_DIR, "sw.js");
	let sw = fs.existsSync(swPath) ? readUtf8(swPath) : readUtf8(path.join(SRC_DIR, "sw.js"));
	sw = sw.replace(/\r?\nvar CACHE_NAME = .*?;\s*$/s, "");
	writeUtf8(swPath, `${sw.trimEnd()}\n\nvar CACHE_NAME = "cstimer_cache_${hash}";\n`);
}

function main() {
	if (!SUPPORTED_LANGS.includes(LANG)) {
		throw new Error(`Unsupported language: ${LANG}`);
	}

	const version = getVersion();
	console.log(`Build version: ${version}`);

	mkdirp(path.join(DIST_DIR, "js"));
	mkdirp(path.join(DIST_DIR, "css"));
	mkdirp(DIST_LANG_DIR);
	mkdirp(path.join(LOCAL_DIR, "js"));
	mkdirp(path.join(LOCAL_DIR, "css"));

	const timerSrc = parseMakeJsList("timerSrc");
	const twistySrc = parseMakeJsList("twistySrc");

	compile(path.join(DIST_DIR, "js", "twisty.js"), twistySrc);
	compile(path.join(DIST_DIR, "js", "cstimer.js"), timerSrc, [
		"--define=DEBUGM=false",
		"--define=DEBUGWK=false"
	]);

	copyDirFiles(path.join(SRC_DIR, "css"), path.join(DIST_DIR, "css"), (name) => name.endsWith(".css"));
	copyDirFiles(LANG_DIR, DIST_LANG_DIR, (name) => name.endsWith(".php"));

	for (const name of fs.readdirSync(LANG_DIR).filter((name) => name.endsWith(".js"))) {
		compile(path.join(DIST_LANG_DIR, name), [path.join(LANG_DIR, name)]);
	}

	copyFile(path.join(SRC_DIR, "cstimer.webmanifest"), path.join(DIST_DIR, "cstimer.webmanifest"));
	copyFile(path.join(SRC_DIR, "cstimer512x512.png"), path.join(DIST_DIR, "cstimer512x512.png"));
	copyFile(path.join(SRC_DIR, "oauthwca.php"), path.join(DIST_DIR, "oauthwca.php"));
	copyFile(path.join(SRC_DIR, "WcaOauth.php"), path.join(DIST_DIR, "WcaOauth.php"));
	updateVersion(version);

	const cacheInputs = [
		path.join(DIST_DIR, "timer.php"),
		path.join(DIST_DIR, "js", "cstimer.js"),
		path.join(DIST_DIR, "js", "twisty.js"),
		path.join(DIST_DIR, "css", "style.css")
	].concat(
		fs.readdirSync(DIST_LANG_DIR).map((name) => path.join(DIST_LANG_DIR, name))
	);
	if (UPDATE_CACHE) {
		updateCacheFiles(md5Files(cacheInputs));
	}

	writeUtf8(path.join(LOCAL_DIR, "index.html"), renderLocalIndex(LANG, version));
	copyFile(path.join(DIST_DIR, "js", "jquery.min.js"), path.join(LOCAL_DIR, "js", "jquery.min.js"));
	copyFile(path.join(DIST_DIR, "js", "cstimer.js"), path.join(LOCAL_DIR, "js", "cstimer.js"));
	copyFile(path.join(DIST_DIR, "js", "twisty.js"), path.join(LOCAL_DIR, "js", "twisty.js"));
	copyFile(path.join(DIST_DIR, "css", "style.css"), path.join(LOCAL_DIR, "css", "style.css"));
	copyFile(path.join(DIST_DIR, "cstimer.webmanifest"), path.join(LOCAL_DIR, "cstimer.webmanifest"));
	copyFile(path.join(DIST_DIR, "cstimer512x512.png"), path.join(LOCAL_DIR, "cstimer512x512.png"));

	console.log(`Local build ready: ${path.join(LOCAL_DIR, "index.html")}`);
}

main();
