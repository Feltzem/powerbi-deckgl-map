const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '..');
const wasmPath = path.join(workspaceRoot, 'node_modules', '@wkpjs', 'web', 'dist', 'wkp_core.wasm');
const wasmJsPath = path.join(workspaceRoot, 'node_modules', '@wkpjs', 'web', 'dist', 'wkp_core.js');
const outputPath = path.join(workspaceRoot, 'src', 'wkpWasmBase64.ts');

if (!fs.existsSync(wasmPath)) {
    throw new Error(`WASM file not found: ${wasmPath}. Run npm install first.`);
}

if (!fs.existsSync(wasmJsPath)) {
    throw new Error(`WASM JS loader not found: ${wasmJsPath}. Run npm install first.`);
}

const wasmBase64 = fs.readFileSync(wasmPath).toString('base64');
const chunkSize = 120;
const chunks = [];
for (let i = 0; i < wasmBase64.length; i += chunkSize) {
    chunks.push(wasmBase64.slice(i, i + chunkSize));
}

const lines = [
    'export const WKP_CORE_WASM_BASE64 =',
    ...chunks.map((chunk, index) => `${index === 0 ? '    ' : '    + '}'${chunk}'`),
    '    ;',
    ''
];

const writeFileIfChanged = (filePath, content) => {
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
    if (existing === content) {
        return false;
    }

    fs.writeFileSync(filePath, content, 'utf8');
    return true;
};

const generatedSource = lines.join('\n');
const generatedWasmSource = writeFileIfChanged(outputPath, generatedSource);
console.log(
    `${generatedWasmSource ? 'Generated' : 'Already up to date'} ${path.relative(workspaceRoot, outputPath)} from ${path.relative(workspaceRoot, wasmPath)}`
);

const jsSource = fs.readFileSync(wasmJsPath, 'utf8');
let patched = jsSource;

patched = patched.replace(
    'if(ENVIRONMENT_IS_NODE){const{createRequire:createRequire}=await import("module");var require=createRequire(import.meta.url)}',
    'if(ENVIRONMENT_IS_NODE){var require=(name=>{throw new Error("Node-only require unavailable in Power BI bundle: "+name)})}'
);

patched = patched.replaceAll('new URL("./",import.meta.url)', '""');

if (patched !== jsSource) {
    writeFileIfChanged(wasmJsPath, patched);
    console.log(`Patched ${path.relative(workspaceRoot, wasmJsPath)} for pbiviz/webpack compatibility`);
} else {
    console.log(`No compatibility patch needed for ${path.relative(workspaceRoot, wasmJsPath)}`);
}
