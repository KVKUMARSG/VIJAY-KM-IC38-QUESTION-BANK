const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../assets');

function cleanAssets() {
    if (!fs.existsSync(ASSETS_DIR)) {
        console.log('Assets directory does not exist.');
        return;
    }
    const files = fs.readdirSync(ASSETS_DIR);
    files.forEach(file => {
        const filePath = path.join(ASSETS_DIR, file);
        try {
            fs.unlinkSync(filePath);
            console.log(`Deleted ${file}`);
        } catch (e) {
            console.error(`Failed to delete ${file}:`, e);
        }
    });
    console.log('All assets cleared.');
}

cleanAssets();
