const fs = require('fs');
const path = require('path');

// Parse CSV with proper handling of quoted fields
function parseCSV(content) {
    const lines = [];
    let currentLine = '';
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentLine += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
                currentLine += char;
            }
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (currentLine.trim()) {
                lines.push(currentLine);
            }
            currentLine = '';
            if (char === '\r' && nextChar === '\n') i++;
        } else {
            currentLine += char;
        }
    }
    if (currentLine.trim()) lines.push(currentLine);

    return lines.map(line => {
        const fields = [];
        let field = '';
        let inQuote = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (!inQuote) {
                    inQuote = true;
                } else if (nextChar === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuote = false;
                }
            } else if (char === ',' && !inQuote) {
                fields.push(field.trim());
                field = '';
            } else {
                field += char;
            }
        }
        fields.push(field.trim());
        return fields;
    });
}

// Clean string value
function cleanValue(val) {
    if (!val || val === 'null' || val === 'undefined' || val === '') return null;
    return val.replace(/^["']|["']$/g, '').trim();
}

// Parse number
function parseNumber(val) {
    if (!val || val === '' || val === 'null') return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
}

// Parse Romanian Product Companies (LinkedIn source)
function parseRomanianCompanies() {
    const filePath = path.join(__dirname, '../Downloads/Romanian-Founders-For-Real-Default-view-export-1770379078998.csv');
    const content = fs.readFileSync(filePath, 'utf-8');
    const rows = parseCSV(content);
    const header = rows[0];

    console.log('Romanian Companies CSV headers:', header.slice(0, 12));

    const companies = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 10) continue;

        // Based on CSV structure
        const companyType = cleanValue(row[8]); // Company Type column

        // Only include product companies
        if (companyType !== 'product_company') continue;

        const founderScore = parseNumber(row[13]);
        const productScore = parseNumber(row[19]);
        const marketScore = parseNumber(row[20]);
        const overallScore = parseNumber(row[21]);

        // Only include companies with complete ratings
        if (founderScore === null || productScore === null || marketScore === null || overallScore === null) continue;

        const company = {
            first_name: cleanValue(row[1]),
            last_name: cleanValue(row[2]),
            founder_name: `${cleanValue(row[1]) || ''} ${cleanValue(row[2]) || ''}`.trim(),
            company_linkedin_url: cleanValue(row[3]),
            company_name: cleanValue(row[4]),
            company_website: cleanValue(row[5]),
            person_linkedin_url: cleanValue(row[6]),
            job_title: cleanValue(row[7]),
            company_type: companyType,
            founder_score: founderScore,
            product_score: productScore,
            market_opportunity_score: marketScore,
            overall_weighted_score: overallScore
        };

        // Only add if has company name
        if (company.company_name) {
            companies.push(company);
        }
    }

    // Sort by overall score descending
    companies.sort((a, b) => {
        if (a.overall_weighted_score === null && b.overall_weighted_score === null) return 0;
        if (a.overall_weighted_score === null) return 1;
        if (b.overall_weighted_score === null) return -1;
        return b.overall_weighted_score - a.overall_weighted_score;
    });

    console.log(`Parsed ${companies.length} Romanian product companies`);
    fs.writeFileSync(
        path.join(__dirname, 'romanian_companies.json'),
        JSON.stringify(companies, null, 2)
    );

    return companies;
}

// Parse Romanian Harmonic Founders - handles multi-line CSV records
function parseHarmonicFounders() {
    const filePath = path.join(__dirname, '../Downloads/Copy-of-Harmonic-Romanian-Founders-for-Real-Default-view-export-1770382318444.csv');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Find all records by matching the pattern: starts with "Name","linkedin..." and ends with ,score
    // Each record starts with "Full Name" pattern and ends with a number
    const recordPattern = /"([^"]+)","(https:\/\/linkedin\.com\/in\/[^"]+)"[\s\S]*?,(\d+)\s*(?=\n"[^"]+","https:|$)/g;

    const founders = [];
    let match;

    while ((match = recordPattern.exec(content)) !== null) {
        const fullName = match[1];
        const linkedinUrl = match[2];
        const founderScore = parseInt(match[3], 10);

        // Skip header row if matched
        if (fullName === 'Full Name') continue;

        // Try to extract education from the record
        let education = '';
        const recordContent = match[0];

        // Look for institution name in education JSON
        const eduMatch = recordContent.match(/institutionName["":\s]+([^"]+)/);
        const degreeMatch = recordContent.match(/degreeType["":\s]+([^"]+)/);
        const fieldMatch = recordContent.match(/fieldOfStudy["":\s]+([^"]+)/);

        if (eduMatch || degreeMatch) {
            const parts = [];
            if (degreeMatch && degreeMatch[1] && degreeMatch[1] !== 'null') {
                parts.push(degreeMatch[1].replace(/[",]/g, '').trim());
            }
            if (fieldMatch && fieldMatch[1] && fieldMatch[1] !== 'null') {
                parts.push(fieldMatch[1].replace(/[",]/g, '').trim());
            }
            if (eduMatch && eduMatch[1]) {
                parts.push(`at ${eduMatch[1].replace(/[",]/g, '').trim()}`);
            }
            education = parts.join(' ');
        }

        if (fullName && !isNaN(founderScore)) {
            founders.push({
                full_name: fullName,
                linkedin_url: linkedinUrl,
                education: education,
                founder_score: founderScore
            });
        }
    }

    console.log(`Parsed ${founders.length} Harmonic founders`);

    // Sort by founder score descending
    founders.sort((a, b) => {
        if (a.founder_score === null && b.founder_score === null) return 0;
        if (a.founder_score === null) return 1;
        if (b.founder_score === null) return -1;
        return b.founder_score - a.founder_score;
    });

    fs.writeFileSync(
        path.join(__dirname, 'harmonic_founders.json'),
        JSON.stringify(founders, null, 2)
    );

    return founders;
}

// Run all parsers
console.log('=== Parsing Romanian Data Sources ===\n');

const romanianCompanies = parseRomanianCompanies();
console.log('');

const harmonicFounders = parseHarmonicFounders();
console.log('');

console.log('=== Summary ===');
console.log(`Romanian Product Companies: ${romanianCompanies.length}`);
console.log(`Harmonic Founders: ${harmonicFounders.length}`);
console.log('\nJSON files created successfully!');
