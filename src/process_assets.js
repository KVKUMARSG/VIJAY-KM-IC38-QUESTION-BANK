const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const ASSETS_DIR = path.join(__dirname, '../assets');
const OUTPUT_FILE = path.join(__dirname, '../data/questions.json');

// Regex patterns for different file formats
const PATTERNS = {
    // Standard: "1. Question ... a) Option ... Ans: a" OR "1. Question ... 1. Option ... Ans: 1"
    standard: {
        question: /^\s*(\d+)[\.\)]\s*(.+)/,
        option: /^\s*([a-d]|[A-D]|[1-4])[\.\)]\s*(.+)/,
        answer: /(?:Ans|Answer|Correct Option)\s*[:\-]\s*([a-d]|[A-D]|[1-4])/i
    },
    // Roman: "Q1: Question ... I. Option ... II. Option"
    roman: {
        question: /^\s*Q?(\d+)[:\.]\s*(.+)/i,
        option: /^\s*([IVX]+)[\.\)]\s*(.+)/,
        answer: /(?:Ans|Answer)\s*[:\-]\s*([IVX]+|[a-d])/i
    },
    // Block: ID \n Question \n Opt1 \n Opt2 \n Opt3 \n Opt4 \n Answer (1-4)
    block: {
        start: /^\s*(\d+)\s*$/, // Just a number on a line
        answer: /^\s*([1-4])\s*$/ // Just a number 1-4 on a line
    }
};

async function extractTextFromPdf(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    try {
        const data = await pdf(dataBuffer);
        return data.text;
    } catch (e) {
        console.error(`Error reading PDF ${filePath}:`, e);
        return '';
    }
}

async function extractTextFromDocx(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    } catch (e) {
        console.error(`Error reading DOCX ${filePath}:`, e);
        return '';
    }
}

function parseQuestions(text, sourceName) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const questions = [];

    // State for standard/roman parsing
    let currentQuestion = null;
    let currentPattern = null;

    // State for block parsing
    let blockBuffer = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // --- BLOCK PARSING LOGIC (Specific to Life-Question Bank style) ---
        if (line.match(PATTERNS.block.start)) {
            if (!currentQuestion && sourceName.includes("Life-Question")) {
                if (line.match(/^[1-4]$/)) {
                    // Potential answer found.
                    if (blockBuffer.length >= 5) {
                        const ansIndex = parseInt(line) - 1; // 0-3
                        const opt4 = blockBuffer.pop();
                        const opt3 = blockBuffer.pop();
                        const opt2 = blockBuffer.pop();
                        const opt1 = blockBuffer.pop();
                        const questionText = blockBuffer.join(' ');

                        const idMatch = questionText.match(/^(\d+)\s+(.+)/);
                        const finalQ = idMatch ? idMatch[2] : questionText;

                        questions.push({
                            id: questions.length + 1,
                            question: finalQ,
                            options: [opt1, opt2, opt3, opt4],
                            correctIndex: ansIndex,
                            explanation: `Source: ${sourceName}`,
                            chartData: null
                        });
                        blockBuffer = [];
                        continue;
                    }
                }
                blockBuffer.push(line);
                continue;
            }
        }
        // --- END BLOCK PARSING ---

        // Standard Parsing
        let qMatch = null;
        let detectedPattern = null;

        // Check Standard
        if (!currentQuestion || currentPattern === 'standard') {
            const m = line.match(PATTERNS.standard.question);
            if (m) { qMatch = m; detectedPattern = 'standard'; }
        }
        // Check Roman
        if (!qMatch && (!currentQuestion || currentPattern === 'roman')) {
            const m = line.match(PATTERNS.roman.question);
            if (m) { qMatch = m; detectedPattern = 'roman'; }
        }

        if (qMatch) {
            // Save previous
            if (currentQuestion && currentQuestion.options.length >= 2) {
                if (currentQuestion.correctIndex === -1) currentQuestion.correctIndex = 0;
                questions.push(currentQuestion);
            }

            currentQuestion = {
                id: questions.length + 1,
                question: qMatch[2],
                options: [],
                correctIndex: -1,
                explanation: `Source: ${sourceName}`,
                chartData: null
            };
            currentPattern = detectedPattern;
            continue;
        }

        if (!currentQuestion) continue;

        // Try to match options
        let optMatch = null;
        if (currentPattern === 'standard') {
            optMatch = line.match(PATTERNS.standard.option);
        } else if (currentPattern === 'roman') {
            optMatch = line.match(PATTERNS.roman.option);
        }

        if (optMatch) {
            currentQuestion.options.push(optMatch[2]);
            continue;
        }

        // Try to match Answer
        let ansMatch = null;
        if (currentPattern === 'standard') {
            ansMatch = line.match(PATTERNS.standard.answer);
            if (ansMatch) {
                const ansStr = ansMatch[1].toLowerCase();
                if (ansStr >= '1' && ansStr <= '4') {
                    currentQuestion.correctIndex = parseInt(ansStr) - 1;
                } else {
                    currentQuestion.correctIndex = ansStr.charCodeAt(0) - 97;
                }
            }
        }

        // Append text if not an option/answer
        if (currentQuestion.options.length === 0 && !line.match(/^(Page|Chapter|Section|ambitiousbaba)/i)) {
            currentQuestion.question += " " + line;
        }
    }

    // Push last
    if (currentQuestion && currentQuestion.options.length >= 2) {
        if (currentQuestion.correctIndex === -1) currentQuestion.correctIndex = 0;
        questions.push(currentQuestion);
    }

    return questions;
}

async function processAll() {
    const files = fs.readdirSync(ASSETS_DIR);
    let allQuestions = [];

    console.log(`Found ${files.length} files in assets.`);

    for (const file of files) {
        const filePath = path.join(ASSETS_DIR, file);
        let text = '';

        console.log(`Processing ${file}...`);

        if (file.endsWith('.pdf')) {
            text = await extractTextFromPdf(filePath);
        } else if (file.endsWith('.docx')) {
            text = await extractTextFromDocx(filePath);
        } else if (file.endsWith('.txt')) {
            text = fs.readFileSync(filePath, 'utf-8');
        }

        if (text) {
            const extracted = parseQuestions(text, file);
            console.log(`  -> Extracted ${extracted.length} questions.`);
            allQuestions = allQuestions.concat(extracted);
        }
    }

    // Validation and Deduplication
    const uniqueQuestions = [];
    const seenQuestions = new Set();
    const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    console.log(`\nValidating ${allQuestions.length} raw questions...`);

    for (const q of allQuestions) {
        // 1. Basic Validation
        if (!q.question || q.question.length < 10) {
            // console.log(`Skipped (Too Short): ${q.question}`);
            continue;
        }
        if (q.options.length !== 4) {
            console.log(`Skipped (Options != 4): ID ${q.id} from ${q.explanation} - Has ${q.options.length} options`);
            continue;
        }
        if (q.correctIndex < 0 || q.correctIndex >= q.options.length) {
            console.log(`Skipped (Invalid Index): ID ${q.id} from ${q.explanation} - Index ${q.correctIndex}`);
            continue;
        }

        // 2. Deduplication
        const qKey = normalize(q.question);
        if (seenQuestions.has(qKey)) {
            console.log(`Skipped (Duplicate): ${q.question.substring(0, 30)}...`);
            continue;
        }

        seenQuestions.add(qKey);

        // 3. Shuffle Options
        // Store the correct option text
        const correctOptionText = q.options[q.correctIndex];

        // Shuffle the options array
        for (let i = q.options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
        }

        // Find the new index of the correct option
        q.correctIndex = q.options.indexOf(correctOptionText);

        // 4. Ensure Explanation
        if (!q.explanation || q.explanation.startsWith("Source:")) {
            q.explanation = `Correct Answer: ${String.fromCharCode(65 + q.correctIndex)}. ${q.explanation}`;
        }

        uniqueQuestions.push(q);
    }

    // Re-index and add navigation fields
    const finalQuestions = uniqueQuestions.map((q, i) => ({
        ...q,
        id: i + 1,
        previous: i > 0 ? i : null,
        next: i < uniqueQuestions.length - 1 ? i + 2 : null
    }));

    console.log(`Total valid unique questions: ${finalQuestions.length}`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalQuestions, null, 4));
    console.log(`Saved to ${OUTPUT_FILE}`);
}

processAll();
