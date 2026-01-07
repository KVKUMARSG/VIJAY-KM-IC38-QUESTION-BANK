const fs = require('fs');
const path = require('path');


const URL = "https://docs.google.com/spreadsheets/d/14I2_kYlYoBqEWf04kgGp68iCj6Cj1F4GYzzLunNRSlk/export?format=xlsx";
const DEST = path.join(__dirname, '../assets/question_bank.xlsx');

async function download() {
    console.log(`Downloading from ${URL}...`);
    const res = await fetch(URL);
    if (!res.ok) {
        throw new Error(`Failed to download: ${res.status} ${res.statusText}`);
    }
    const buffer = await res.buffer();
    fs.writeFileSync(DEST, buffer);
    console.log(`Saved to ${DEST}`);
}

download().catch(console.error);
