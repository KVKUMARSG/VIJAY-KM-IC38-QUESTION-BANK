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

function parseQuestions(text, source) {
    const questions = [];

    // Pattern 1: Block Format (ID on one line, Question, Options, Answer)
    // This is common in "Life-Question Bank"
    if (source.includes('Life-Question Bank')) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        let i = 0;
        while (i < lines.length) {
            // Look for a number (ID)
            if (/^\d+$/.test(lines[i])) {
                const id = parseInt(lines[i]);
                i++;

                let blockLines = [];
                // Collect lines until we hit options or next ID
                // The block ends when we see the next ID or end of file
                while (i < lines.length && !/^\d+$/.test(lines[i])) {
                    blockLines.push(lines[i]);
                    i++;
                }

                // Process block
                // Expectation: Question lines... Option lines... Answer digit
                if (blockLines.length >= 2) {
                    const lastLine = blockLines[blockLines.length - 1];
                    const ansMatch = lastLine.match(/(\d)$/);
                    if (ansMatch) {
                        const correctIndex = parseInt(ansMatch[1]) - 1;
                        // Remove answer from last line
                        blockLines[blockLines.length - 1] = lastLine.replace(/(\d)$/, '').trim();

                        // Heuristic: Split by '?' to separate question and options
                        const fullText = blockLines.join(' ');
                        let qText = "";
                        let optsText = "";

                        const qSplit = fullText.split('?');
                        if (qSplit.length >= 2) {
                            qText = qSplit[0] + '?';
                            optsText = qSplit.slice(1).join('?').trim();
                        } else {
                            // No '?' found. Assume the whole text needs splitting.
                            optsText = fullText;
                        }

                        let opts = [];

                        // Strategy A: Explicit Labels
                        const labelMatch = optsText.match(/([A-Da-d1-4])[\.\)]/g);
                        if (labelMatch && labelMatch.length >= 3) {
                            const parts = optsText.split(/\s*(?:[A-Da-d1-4])[\.\)]\s*/).filter(p => p);
                            if (qText) {
                                if (parts.length >= 4) opts = parts;
                            } else {
                                if (parts.length >= 5) {
                                    qText = parts[0];
                                    opts = parts.slice(1);
                                }
                            }
                        }

                        // Strategy B: Aggressive Split
                        if (opts.length < 4) {
                            const parts = optsText.split(/(?<=[a-z0-9\)])\s*(?=[A-Z])/).map(o => o.trim());

                            if (qText) {
                                opts = parts;
                            } else {
                                if (parts.length >= 5) {
                                    qText = parts[0];
                                    opts = parts.slice(1);
                                }
                            }
                        }

                        // Merge strategy for over-splitting
                        while (opts.length > 4) {
                            let merged = false;
                            for (let i = 0; i < opts.length - 1; i++) {
                                if (opts[i].match(/(of|the|and|a|an|with|to|in|on|at|by|for)$/i)) {
                                    opts[i] = opts[i] + " " + opts[i + 1];
                                    opts.splice(i + 1, 1);
                                    merged = true;
                                    break;
                                }
                            }

                            if (!merged) {
                                let shortestIdx = 0;
                                for (let i = 1; i < opts.length; i++) {
                                    if (opts[i].length < opts[shortestIdx].length) shortestIdx = i;
                                }

                                if (shortestIdx === 0) {
                                    opts[0] = opts[0] + " " + opts[1];
                                    opts.splice(1, 1);
                                } else if (shortestIdx === opts.length - 1) {
                                    opts[shortestIdx - 1] = opts[shortestIdx - 1] + " " + opts[shortestIdx];
                                    opts.splice(shortestIdx, 1);
                                } else {
                                    if (opts[shortestIdx - 1].length < opts[shortestIdx + 1].length) {
                                        opts[shortestIdx - 1] = opts[shortestIdx - 1] + " " + opts[shortestIdx];
                                        opts.splice(shortestIdx, 1);
                                    } else {
                                        opts[shortestIdx] = opts[shortestIdx] + " " + opts[shortestIdx + 1];
                                        opts.splice(shortestIdx + 1, 1);
                                    }
                                }
                            }
                        }

                        // Debug logging removed

                        if (qText && opts.length === 4) {
                            questions.push({
                                id: id,
                                question: qText,
                                options: opts,
                                correctIndex: correctIndex,
                                explanation: `Source: ${path.basename(source)}`
                            });
                        }
                    }
                }
                continue; // Continue outer loop (i is already at next ID)
            }
            i++;
        }
        return questions;
    }

    return questions;
}

async function processAll() {
    const files = fs.readdirSync(ASSETS_DIR);
    let allQuestions = [];

    console.log(`Found ${files.length} files in assets.`);

    for (const file of files) {
        // Exclude known bad files
        if (file.includes('ic38-irda-fresh.pdf') ||
            file.includes('ic-38-irdai-refresher-workbook.pdf') ||
            file.includes('IRDA_EXAM_01.docx') ||
            file.includes('mock_01') ||
            file.includes('ambitious_baba.pdf')) {
            console.log(`Skipping excluded file: ${file}`);
            continue;
        }

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
            continue;
        }
        if (q.options.length !== 4) {
            console.log(`Skipped (Options != 4): ID ${q.id} - Has ${q.options.length} options`);
            continue;
        }
        if (q.correctIndex < 0 || q.correctIndex >= q.options.length) {
            console.log(`Skipped (Invalid Index): ID ${q.id} - Index ${q.correctIndex}`);
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
        const correctOptionText = q.options[q.correctIndex];
        for (let i = q.options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
        }
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
