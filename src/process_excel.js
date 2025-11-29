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

            // Extract fields
            const question = normalizedRow['question'] || normalizedRow['q'];
            const optA = normalizedRow['option a'] || normalizedRow['a'] || normalizedRow['opt a'];
            const optB = normalizedRow['option b'] || normalizedRow['b'] || normalizedRow['opt b'];
            const optC = normalizedRow['option c'] || normalizedRow['c'] || normalizedRow['opt c'];
            const optD = normalizedRow['option d'] || normalizedRow['d'] || normalizedRow['opt d'];
            let answer = normalizedRow['answer'] || normalizedRow['correct answer'] || normalizedRow['ans'];
            const explanation = normalizedRow['explanation'] || normalizedRow['rationale'] || normalizedRow['details'] || '';

            if (!question || !optA || !optB || !optC || !optD || !answer) {
                console.log(`  -> Skipping Row ${index + 2}: Missing required fields.`);
                return;
            }

            // Normalize Answer
            let correctIndex = -1;
            answer = String(answer).trim().toUpperCase();

            if (answer === 'A' || answer === '1') correctIndex = 0;
            else if (answer === 'B' || answer === '2') correctIndex = 1;
            else if (answer === 'C' || answer === '3') correctIndex = 2;
            else if (answer === 'D' || answer === '4') correctIndex = 3;
            else {
                // Try matching text
                const options = [optA, optB, optC, optD];
                correctIndex = options.findIndex(o => String(o).trim().toLowerCase() === String(answer).trim().toLowerCase());
            }

            if (correctIndex === -1) {
                console.log(`  -> Skipping Row ${index + 2}: Invalid answer format "${answer}".`);
                return;
            }

            allQuestions.push({
                id: allQuestions.length + 1,
                question: String(question).trim(),
                options: [String(optA).trim(), String(optB).trim(), String(optC).trim(), String(optD).trim()],
                correctIndex: correctIndex,
                explanation: explanation ? String(explanation).trim() : `Correct Answer: ${String.fromCharCode(65 + correctIndex)}`,
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
