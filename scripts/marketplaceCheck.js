#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const failures = [];
const warnings = [];

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function run(command, args) {
  console.log(`\n> ${[command, ...args].join(" ")}`);
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

function checkPackageMetadata(pkg) {
  if (!pkg.name || !pkg.displayName || !pkg.description) {
    fail("package.json must define name, displayName, and description.");
  }

  if (!pkg.publisher || pkg.publisher === "local" || pkg.publisher.includes("CHANGE-ME")) {
    fail('package.json publisher must be a real Marketplace publisher id, not "local".');
  }

  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pkg.version || "")) {
    fail("package.json version must be valid semver.");
  }

  if (!pkg.repository?.url || pkg.repository.url.includes("CHANGE-ME")) {
    fail("package.json repository.url must point to the real repository before Marketplace publish.");
  }

  if (!exists("LICENSE") && !exists("LICENSE.md") && !exists("LICENSE.txt")) {
    fail("A LICENSE, LICENSE.md, or LICENSE.txt file is required before Marketplace publish.");
  }

  const providerConfig =
    pkg.contributes?.configuration?.properties?.["vscode-side-translate.provider"];
  const expectedProviders = ["fastest", "deepl", "google", "bing"];
  if (!providerConfig) {
    fail("Provider configuration is missing from package.json.");
    return;
  }

  for (const provider of expectedProviders) {
    if (!providerConfig.enum?.includes(provider)) {
      fail(`Provider enum must include "${provider}".`);
    }
  }

  if (providerConfig.default !== "fastest") {
    fail('Default provider must remain "fastest" unless README disclosure and tests are updated.');
  }
}

function checkReadmeDisclosure() {
  if (!exists("README.md")) {
    fail("README.md is required.");
    return;
  }

  const readme = readText("README.md").toLowerCase();
  const requiredPhrases = [
    "third-party translation",
    "bing translator",
    "deepl free",
    "google translate",
  ];

  for (const phrase of requiredPhrases) {
    if (!readme.includes(phrase)) {
      fail(`README.md must disclose "${phrase}".`);
    }
  }
}

function checkVscodeIgnore() {
  if (!exists(".vscodeignore")) {
    fail(".vscodeignore is required to keep development files out of the VSIX.");
    return;
  }

  const ignore = readText(".vscodeignore");
  const requiredPatterns = [
    ".vscode/**",
    ".vscode-test/**",
    ".git/**",
    "src/**",
    "out/test/**",
    "scripts/**",
    "AGENTS.md",
    "*.vsix",
  ];

  for (const pattern of requiredPatterns) {
    if (!ignore.includes(pattern)) {
      fail(`.vscodeignore must include ${pattern}.`);
    }
  }
}

function checkNoObviousSecrets() {
  const secretPatterns = [
    { name: "OpenAI-style key", regex: /sk-[A-Za-z0-9_-]{20,}/ },
    { name: "GitHub token", regex: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
    { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/ },
    { name: "Google API key", regex: /AIza[0-9A-Za-z_-]{20,}/ },
    { name: "Private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  ];
  const ignoredDirectories = new Set([".git", "node_modules", "out", ".vscode-test"]);
  const ignoredExtensions = new Set([".vsix", ".map"]);

  function scanDirectory(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(root, fullPath);

      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          scanDirectory(fullPath);
        }
        continue;
      }

      if (ignoredExtensions.has(path.extname(entry.name))) {
        continue;
      }

      const content = fs.readFileSync(fullPath, "utf8");
      for (const pattern of secretPatterns) {
        if (pattern.regex.test(content)) {
          fail(`Potential ${pattern.name} found in ${relativePath}.`);
        }
      }
    }
  }

  scanDirectory(root);
}

function checkPackagedFiles() {
  const outputPath = path.join(root, ".vscode-test", "marketplace-check.vsix");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (fs.existsSync(outputPath)) {
    fs.rmSync(outputPath);
  }

  run("npx", [
    "@vscode/vsce",
    "package",
    "--allow-missing-repository",
    "--out",
    outputPath,
  ]);

  const listOutput = execFileSync("npx", ["@vscode/vsce", "ls", "--tree"], {
    cwd: root,
    encoding: "utf8",
  });
  const forbidden = ["src/", "out/test/", ".vscode/", ".vscode-test/", ".git/", "scripts/", "AGENTS.md"];
  for (const item of forbidden) {
    if (listOutput.includes(item)) {
      fail(`VSIX package must not include ${item}.`);
    }
  }
}

function main() {
  const pkg = JSON.parse(readText("package.json"));

  checkPackageMetadata(pkg);
  checkReadmeDisclosure();
  checkVscodeIgnore();
  checkNoObviousSecrets();

  run("npm", ["run", "compile"]);
  run("npm", ["test"]);
  run("npm", ["audit"]);
  checkPackagedFiles();

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const message of warnings) {
      console.log(`- ${message}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nMarketplace check failed:");
    for (const message of failures) {
      console.error(`- ${message}`);
    }
    process.exit(1);
  }

  console.log("\nMarketplace check passed.");
}

main();
