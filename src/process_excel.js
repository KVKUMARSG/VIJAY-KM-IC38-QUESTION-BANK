const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ASSETS_DIR = path.join(__dirname, '../assets');
const OUTPUT_FILE = path.join(__dirname, '../data/questions.json');

function processExcel() {
    const files = fs.readdirSync(ASSETS_DIR).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));

    if (files.length === 0) {
        console.log("No Excel files found in assets directory.");
        return;
    }

    console.log(`Found ${files.length} Excel files. Processing...`);
    let allQuestions = [];

    files.forEach(file => {
        const filePath = path.join(ASSETS_DIR, file);
        console.log(`Reading ${file}...`);

        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const rows = XLSX.utils.sheet_to_json(sheet);
        console.log(`  -> Found ${rows.length} rows.`);

        rows.forEach((row, index) => {
            // Normalize keys to lowercase for flexible matching
            const normalizedRow = {};
            Object.keys(row).forEach(key => {
                normalizedRow[key.toLowerCase().trim()] = row[key];
            });

            // Extract fields based on user's headers
            const question = normalizedRow['question body'];
            const optA = normalizedRow['alternative 1'];
            const optB = normalizedRow['alternative 2'];
            const optC = normalizedRow['alternative 3'];
            const optD = normalizedRow['alternative 4'];
            let answerRaw = normalizedRow['correct alternative']; // Expecting 1, 2, 3, 4 or I, II, III, IV
            const category = normalizedRow['syllabus category name'] || 'General';
            const additionalInfo = normalizedRow['additional information'] || '';

            if (!question || !optA || !optB || !optC || !optD) {
                // console.log(`  -> Skipping Row ${index + 2}: Missing required fields.`);
                return;
            }

            // Normalize Answer
            let correctIndex = -1;
            // Handle "Alternative 1", "1", 1, "A", "I", etc.
            const ansStr = String(answerRaw).trim().toUpperCase();

            if (ansStr.includes('1') || ansStr === 'A' || ansStr === 'I') correctIndex = 0;
            else if (ansStr.includes('2') || ansStr === 'B' || ansStr === 'II') correctIndex = 1;
            else if (ansStr.includes('3') || ansStr === 'C' || ansStr === 'III') correctIndex = 2;
            else if (ansStr.includes('4') || ansStr === 'D' || ansStr === 'IV') correctIndex = 3;

            if (correctIndex === -1) {
                console.log(`  -> Skipping Row ${index + 2}: Invalid answer format "${answerRaw}".`);
                return;
            }

            // Construct Explanation
            let explanationText = additionalInfo;
            if (category) {
                explanationText = `<strong>Category:</strong> ${category}<br><br>${explanationText}`;
            }

            allQuestions.push({
                id: allQuestions.length + 1,
                question: String(question).trim(),
                options: [String(optA).trim(), String(optB).trim(), String(optC).trim(), String(optD).trim()],
                correctIndex: correctIndex,
                explanation: explanationText,
                category: category,
                previous: allQuestions.length > 0 ? allQuestions.length : null,
                next: null // Will update later
            });
        });
    });

    // Update next pointers
    allQuestions.forEach((q, i) => {
        if (i < allQuestions.length - 1) {
            q.next = i + 2;
        }
    });

    console.log(`\nTotal valid questions extracted: ${allQuestions.length}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allQuestions, null, 4));
    console.log(`Saved to ${OUTPUT_FILE}`);
}

processExcel();
