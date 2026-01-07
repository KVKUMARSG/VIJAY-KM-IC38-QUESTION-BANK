const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const ASSETS_DIR = path.join(__dirname, '../assets');

async function debugFile(filename) {
    const filePath = path.join(ASSETS_DIR, filename);
    let text = '';

    console.log(`\n--- DEBUGGING ${filename} ---`);
    if (filename.endsWith('.pdf')) {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        text = data.text;
    } else if (filename.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ path: filePath });
        text = result.value;
    }

    console.log(text.substring(text.length - 2000)); // Print last 2000 chars
}

async function runDebug() {
    console.log("--- DEBUGGING ic-38-irdai-refresher-workbook.pdf ---");
    await debugFile('ic-38-irdai-refresher-workbook.pdf');
}

runDebug();
